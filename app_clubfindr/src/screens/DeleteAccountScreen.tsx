import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation';
import * as mobileDeleteAccountService from '../services/mobileDeleteAccountService';

type DeleteAccountScreenProps = {
    navigation: StackNavigationProp<RootStackParamList, 'DeleteAccount'>;
};

const DeleteAccountScreen = ({ navigation }: DeleteAccountScreenProps) => {
    const { user, logout } = useAuth();
    const [step, setStep] = useState<'initial' | 'confirmation' | 'verification'>('initial');
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState(user?.email || '');
    const [confirmationCode, setConfirmationCode] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Request confirmation code via email
    const requestConfirmationCode = async () => {
        try {
            setLoading(true);
            setError(null);

            // Validate email
            if (!email || !email.includes('@')) {
                setError('Please enter a valid email address');
                return;
            }

            // Call the API to request a confirmation code
            const response = await mobileDeleteAccountService.sendConfirmationCode(email);

            if (response.success) {
                // Move to confirmation code entry step
                setStep('confirmation');
                Alert.alert(
                    'Confirmation Code Sent',
                    'A confirmation code has been sent to your email. Please enter it to continue with account deletion.'
                );
            } else {
                setError(response.message || 'Failed to send confirmation code');
            }
        } catch (error) {
            console.error('Error requesting confirmation code:', error);
            setError('Failed to send confirmation code. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    // Verify confirmation code and delete account
    const verifyAndDeleteAccount = async () => {
        try {
            setLoading(true);
            setError(null);

            // Validate confirmation code
            if (!confirmationCode || confirmationCode.length < 6) {
                setError('Please enter a valid confirmation code');
                return;
            }

            // Call the API to verify code and delete account data
            const response = await mobileDeleteAccountService.confirmAccountDeletion(email, confirmationCode);

            if (response.success) {
                // Clean up local storage before logging out
                await mobileDeleteAccountService.cleanupLocalData();

                Alert.alert(
                    'Account Data Deleted',
                    'Your account data has been successfully deleted. You will now be logged out.',
                    [
                        {
                            text: 'OK',
                            onPress: async () => {
                                // Log out with full data cleanup
                                await logout(true);
                                // Navigate back to login screen
                                navigation.reset({
                                    index: 0,
                                    routes: [{ name: 'Login' }],
                                });
                            }
                        }
                    ]
                );
            } else {
                setError(response.error || 'Failed to delete account data');
            }
        } catch (error) {
            console.error('Error deleting account:', error);
            setError('Failed to delete account data. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    // Cancel the deletion process
    const cancelDeletion = () => {
        Alert.alert(
            'Cancel Account Deletion',
            'Are you sure you want to cancel the account deletion process?',
            [
                {
                    text: 'No',
                    style: 'cancel'
                },
                {
                    text: 'Yes',
                    onPress: () => {
                        navigation.goBack();
                    }
                }
            ]
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0}
        >
            <ScrollView contentContainerStyle={styles.scrollContainer}>
                <View style={styles.header}>
                    <Text style={styles.title}>Delete Account</Text>
                    <Text style={styles.subtitle}>
                        This action cannot be undone. All your personal data will be permanently deleted.
                    </Text>
                </View>

                {step === 'initial' && (
                    <View style={styles.form}>
                        <Text style={styles.label}>Confirm your email address:</Text>
                        <TextInput
                            style={styles.input}
                            value={email}
                            onChangeText={setEmail}
                            placeholder="Email address"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={!loading}
                            testID="email-input"
                        />

                        {error && <Text style={styles.errorText}>{error}</Text>}

                        <View style={styles.buttonContainer}>
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={cancelDeletion}
                                disabled={loading}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={requestConfirmationCode}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <Text style={styles.actionButtonText}>Continue</Text>
                                )}
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.infoText}>
                            A confirmation code will be sent to your email address to verify your identity.
                        </Text>
                    </View>
                )}

                {step === 'confirmation' && (
                    <View style={styles.form}>
                        <Text style={styles.label}>Enter the confirmation code sent to your email:</Text>
                        <TextInput
                            style={styles.input}
                            value={confirmationCode}
                            onChangeText={setConfirmationCode}
                            placeholder="Confirmation code"
                            keyboardType="default"
                            autoCapitalize="characters"
                            editable={!loading}
                            testID="code-input"
                        />

                        {error && <Text style={styles.errorText}>{error}</Text>}

                        <View style={styles.buttonContainer}>
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={cancelDeletion}
                                disabled={loading}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={verifyAndDeleteAccount}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <Text style={styles.actionButtonText}>Delete My Account</Text>
                                )}
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.infoText}>
                            After verification, all your personal data will be permanently deleted from our systems.
                        </Text>
                    </View>
                )}

                <View style={styles.warningContainer}>
                    <Text style={styles.warningTitle}>What will be deleted:</Text>
                    <Text style={styles.warningText}>• Your name and personal information</Text>
                    <Text style={styles.warningText}>• Your email addresses</Text>
                    <Text style={styles.warningText}>• Your Spotify connection and data</Text>
                    <Text style={styles.warningText}>• Your preferences and settings</Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    scrollContainer: {
        flexGrow: 1,
        padding: 20,
    },
    header: {
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#FF5252',
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 16,
        color: '#FFFFFF',
        opacity: 0.8,
        lineHeight: 22,
    },
    form: {
        marginBottom: 24,
    },
    label: {
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#2A2A2A',
        borderRadius: 5,
        padding: 15,
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 16,
    },
    errorText: {
        color: '#FF5252',
        marginBottom: 16,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    cancelButton: {
        flex: 1,
        padding: 15,
        backgroundColor: '#333333',
        borderRadius: 5,
        alignItems: 'center',
        marginRight: 10,
    },
    cancelButtonText: {
        color: '#FFFFFF',
        fontWeight: '500',
        fontSize: 16,
    },
    actionButton: {
        flex: 1,
        padding: 15,
        backgroundColor: '#FF5252',
        borderRadius: 5,
        alignItems: 'center',
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    infoText: {
        color: '#CCCCCC',
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
    },
    warningContainer: {
        backgroundColor: '#2A2A2A',
        padding: 16,
        borderRadius: 8,
        marginBottom: 20,
    },
    warningTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FF5252',
        marginBottom: 10,
    },
    warningText: {
        color: '#FFFFFF',
        fontSize: 14,
        marginBottom: 8,
        lineHeight: 20,
    },
});

export default DeleteAccountScreen;
