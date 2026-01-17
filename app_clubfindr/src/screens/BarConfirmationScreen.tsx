import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation';
import axiosClient from '../api/axiosClient';

type BarConfirmationScreenRouteProp = RouteProp<RootStackParamList, 'BarConfirmation'>;
type BarConfirmationScreenNavigationProp = StackNavigationProp<RootStackParamList, 'BarConfirmation'>;

const BarConfirmationScreen = () => {
    const navigation = useNavigation<BarConfirmationScreenNavigationProp>();
    const route = useRoute<BarConfirmationScreenRouteProp>();

    // Form state
    const [email, setEmail] = useState('');
    const [confirmationCode, setConfirmationCode] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [canResend, setCanResend] = useState(true);

    // Set email from route params when component mounts
    useEffect(() => {
        if (route.params?.email) {
            setEmail(route.params.email);
        }
    }, [route.params]);

    // Handle countdown timer for resend button
    useEffect(() => {
        let interval: NodeJS.Timeout | undefined;

        if (resendCooldown > 0) {
            interval = setInterval(() => {
                setResendCooldown((prev) => {
                    if (prev <= 1) {
                        setCanResend(true);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [resendCooldown]);

    // Handle confirmation submission
    const handleConfirm = async () => {
        if (loading) return;

        // Validate inputs
        if (!email.trim()) {
            setErrorMessage('Please enter your email');
            return;
        }

        if (!confirmationCode.trim()) {
            setErrorMessage('Please enter the confirmation code');
            return;
        }

        setLoading(true);
        setErrorMessage('');

        try {
            const response = await axiosClient.post('/api/mobile/bars/confirm', {
                email: email.trim().toLowerCase(),
                confirmationCode: confirmationCode.trim()
            });

            if (response.data.success) {
                Alert.alert(
                    'Confirmation Successful',
                    'Your bar registration has been confirmed. You can now log in to manage your bar.',
                    [
                        {
                            text: 'OK',
                            onPress: () => navigation.navigate('Login')
                        }
                    ]
                );
            } else {
                setAttempts(prev => prev + 1);

                if (attempts >= 2) { // 3 attempts total (0, 1, 2)
                    setErrorMessage('Maximum number of attempts reached. Please try again later.');
                } else {
                    setErrorMessage(response.data.error || 'Confirmation failed. Please check the code and try again.');
                }
            }
        } catch (error) {
            console.error('Confirmation error:', error);
            setErrorMessage('An error occurred while confirming your registration. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    // Handle resend confirmation code
    const handleResendCode = async () => {
        if (!canResend || resendCooldown > 0 || attempts >= 3 || loading) return;

        if (!email.trim()) {
            setErrorMessage('Please enter your email to resend the code');
            return;
        }

        setLoading(true);
        setErrorMessage('');

        try {
            const response = await axiosClient.post('/api/mobile/bars/resend-code', {
                email: email.trim().toLowerCase()
            });

            if (response.data.success) {
                setCanResend(false);
                setResendCooldown(120); // 2 minutes cooldown
                Alert.alert('Code Resent', 'A new confirmation code has been sent to your email.');
            } else {
                setErrorMessage(response.data.error || 'Failed to resend the confirmation code. Please try again later.');
            }
        } catch (error) {
            console.error('Resend code error:', error);
            setErrorMessage('An error occurred while resending the confirmation code. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0}
        >
            <ScrollView contentContainerStyle={styles.scrollContainer}>
                <View style={styles.formContainer}>
                    <Text style={styles.title}>Confirm Your Registration</Text>
                    <Text style={styles.subtitle}>
                        We've sent a verification code to your email. Please enter it below to complete your registration.
                    </Text>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            value={email}
                            onChangeText={setEmail}
                            placeholder="Enter your email"
                            placeholderTextColor="#999"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            editable={!loading}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Confirmation Code</Text>
                        <TextInput
                            style={styles.input}
                            value={confirmationCode}
                            onChangeText={setConfirmationCode}
                            placeholder="Enter the code from your email"
                            placeholderTextColor="#999"
                            autoCapitalize="characters"
                            maxLength={6}
                            editable={!loading && attempts < 3}
                        />
                    </View>

                    {errorMessage ? (
                        <Text style={styles.errorText}>{errorMessage}</Text>
                    ) : null}

                    <TouchableOpacity
                        style={[styles.confirmButton, (loading || attempts >= 3) && styles.disabledButton]}
                        onPress={handleConfirm}
                        disabled={loading || attempts >= 3}
                    >
                        {loading ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <Text style={styles.confirmButtonText}>Confirm Registration</Text>
                        )}
                    </TouchableOpacity>

                    {attempts < 3 && (
                        <View style={styles.resendContainer}>
                            {canResend && resendCooldown === 0 ? (
                                <TouchableOpacity onPress={handleResendCode} disabled={loading}>
                                    <Text style={styles.resendText}>Didn't receive a code? Resend</Text>
                                </TouchableOpacity>
                            ) : (
                                <Text style={styles.cooldownText}>
                                    Resend available in {Math.floor(resendCooldown / 60)}:{String(resendCooldown % 60).padStart(2, '0')}
                                </Text>
                            )}
                        </View>
                    )}
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
        justifyContent: 'center',
    },
    formContainer: {
        backgroundColor: '#222222',
        borderRadius: 10,
        padding: 20,
        width: '100%',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 10,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: '#CCCCCC',
        marginBottom: 20,
        textAlign: 'center',
    },
    inputGroup: {
        marginBottom: 15,
    },
    label: {
        fontSize: 16,
        color: '#FFFFFF',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#333333',
        color: '#FFFFFF',
        padding: 15,
        borderRadius: 5,
        fontSize: 16,
    },
    errorText: {
        color: '#FF4D4F',
        fontSize: 14,
        marginBottom: 15,
        textAlign: 'center',
    },
    confirmButton: {
        backgroundColor: '#D35400',
        padding: 15,
        borderRadius: 5,
        alignItems: 'center',
        marginTop: 10,
    },
    confirmButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    disabledButton: {
        backgroundColor: '#555555',
        opacity: 0.7,
    },
    resendContainer: {
        marginTop: 20,
        alignItems: 'center',
    },
    resendText: {
        color: '#D35400',
        fontSize: 14,
        textDecorationLine: 'underline',
    },
    cooldownText: {
        color: '#CCCCCC',
        fontSize: 14,
    },
});

export default BarConfirmationScreen;