import React, { useState, useEffect } from 'react';
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
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation';
import { RouteProp } from '@react-navigation/native';
import * as emailVerificationService from '../services/mobileEmailVerificationService';

type EmailVerificationScreenProps = {
    navigation: StackNavigationProp<RootStackParamList, 'EmailVerification'>;
    route: RouteProp<RootStackParamList, 'EmailVerification'>;
};

const EmailVerificationScreen = ({ navigation, route }: EmailVerificationScreenProps) => {
    const { email } = route.params;
    const [confirmationCode, setConfirmationCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendDisabled, setResendDisabled] = useState(false);
    const [countdown, setCountdown] = useState(0);

    // Handle countdown timer for resend button
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (countdown > 0) {
            timer = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        setResendDisabled(false);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [countdown]);

    // Verify confirmation code
    const verifyConfirmationCode = async () => {
        if (!confirmationCode || confirmationCode.length < 6) {
            setError('Please enter a valid confirmation code');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Call service to verify the confirmation code
            const response = await emailVerificationService.verifyEmailWithCode(email, confirmationCode);
            console.log('Verification response:', response);

            if (response.success) {
                Alert.alert(
                    'Email Verified',
                    'Your email has been successfully verified! You can now log in.',
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                navigation.reset({
                                    index: 0,
                                    routes: [{ name: 'Login' }],
                                });
                            }
                        }
                    ]
                );
            } else {
                setError(response.message || 'Invalid confirmation code');
            }
        } catch (error) {
            console.error('Error verifying email:', error);
            setError('Failed to verify email. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Resend confirmation code
    const resendConfirmationCode = async () => {
        try {
            setLoading(true);
            setError(null);

            // Call service to resend the confirmation code
            const response = await emailVerificationService.resendVerificationCode(email);

            if (response && response.data && response.data.success) {
                Alert.alert('Success', 'A new confirmation code has been sent to your email.');
                setResendDisabled(true);
                setCountdown(60); // 60 seconds cooldown
            } else {
                const errorMessage = response?.data?.message || 'Failed to resend code';
                setError(errorMessage);
            }
        } catch (error) {
            console.error('Error resending code:', error);
            setError('Failed to resend confirmation code. Please try again.');
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
                <View style={styles.header}>
                    <Text style={styles.title}>Verify Your Email</Text>
                    <Text style={styles.subtitle}>
                        We've sent a verification code to {email}. Please enter it below to verify your account.
                    </Text>
                </View>

                <View style={styles.form}>
                    <Text style={styles.label}>Enter verification code:</Text>
                    <TextInput
                        style={styles.input}
                        value={confirmationCode}
                        onChangeText={setConfirmationCode}
                        placeholder="Verification code"
                        keyboardType="default"
                        autoCapitalize="characters"
                        autoComplete="one-time-code"
                        textContentType="oneTimeCode"
                        importantForAutofill="yes"
                        editable={!loading}
                        testID="code-input"
                    />

                    {error && <Text style={styles.errorText}>{error}</Text>}

                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={verifyConfirmationCode}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <Text style={styles.actionButtonText}>Verify Email</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.resendButton, resendDisabled && styles.disabledButton]}
                        onPress={resendConfirmationCode}
                        disabled={loading || resendDisabled}
                    >
                        <Text style={[styles.resendButtonText, resendDisabled && styles.disabledText]}>
                            {resendDisabled
                                ? `Resend Code (${countdown}s)`
                                : 'Resend Code'}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.infoContainer}>
                    <Text style={styles.infoText}>
                        Please check your inbox and spam folder. If you still don't receive the code,
                        you can request a new one after the countdown ends.
                    </Text>
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
        color: '#D35400',
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
        textAlign: 'center',
        letterSpacing: 2,
    },
    errorText: {
        color: '#FF5252',
        marginBottom: 16,
    },
    actionButton: {
        padding: 15,
        backgroundColor: '#D35400',
        borderRadius: 5,
        alignItems: 'center',
        marginBottom: 16,
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    resendButton: {
        padding: 12,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#D35400',
        borderRadius: 5,
        alignItems: 'center',
    },
    disabledButton: {
        borderColor: '#666666',
        opacity: 0.7,
    },
    disabledText: {
        color: '#999999',
    },
    resendButtonText: {
        color: '#D35400',
        fontWeight: '500',
    },
    infoContainer: {
        backgroundColor: '#2A2A2A',
        padding: 16,
        borderRadius: 8,
        marginTop: 20,
    },
    infoText: {
        color: '#CCCCCC',
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
    },
});

export default EmailVerificationScreen;