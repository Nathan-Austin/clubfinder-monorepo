import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Alert,
    ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation';
import { Picker } from '@react-native-picker/picker';
import axiosClient from '../api/axiosClient';

interface SignupResponse {
    success: boolean;
    message?: string;
    userId?: string;
    requiresEmailVerification?: boolean;
    requiresSpotifySetup?: boolean;
}

type SignupScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Signup'>;

type MusicService = '' | 'spotify' | 'apple' | 'soundcloud' | 'deezer';

const MUSIC_SERVICES = [
    { label: 'Select a music service', value: '', disabled: false },
    { label: 'Spotify', value: 'spotify', disabled: false },
    { label: 'YouTube Music', value: 'youtube', disabled: true },
    { label: 'Tidal', value: 'tidal', disabled: true },
    { label: 'Amazon Music', value: 'amazon', disabled: true },
    { label: 'Pandora', value: 'pandora', disabled: true },
    { label: 'iHeartRadio', value: 'iheartradio', disabled: true },
    { label: 'Apple Music', value: 'apple', disabled: true },
    { label: 'SoundCloud', value: 'soundcloud', disabled: true },
    { label: 'Deezer', value: 'deezer', disabled: true }
];

const SignupScreen = () => {
    const navigation = useNavigation<SignupScreenNavigationProp>();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [musicService, setMusicService] = useState<MusicService>('');
    const [spotifyEmail, setSpotifyEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Add state for T&Cs and Privacy Policy acceptance
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

    const passwordRequirements = useMemo(() => [
        { test: (p: string) => p.length >= 8, text: 'At least 8 characters' },
        { test: (p: string) => /[A-Z]/.test(p), text: 'Contains uppercase letter' },
        { test: (p: string) => /[a-z]/.test(p), text: 'Contains lowercase letter' },
        { test: (p: string) => /[0-9]/.test(p), text: 'Contains number' },
        { test: (p: string) => /[^A-Za-z0-9]/.test(p), text: 'Contains special character' },
    ], []);

    const isPasswordValid = (password: string): boolean => {
        return passwordRequirements.every(req => req.test(password));
    };

    const validateInputs = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!name.trim()) {
            newErrors.name = 'Name is required';
        }

        if (!email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/^\S+@\S+\.\S+$/.test(email)) {
            newErrors.email = 'Invalid email format';
        }

        if (!password.trim()) {
            newErrors.password = 'Password is required';
        } else if (!isPasswordValid(password)) {
            newErrors.password = 'Password does not meet all requirements';
        }

        if (!musicService) {
            newErrors.musicService = 'Please select a music service';
        }

        if (musicService === 'spotify' && spotifyEmail.trim() && !/^\S+@\S+\.\S+$/.test(spotifyEmail)) {
            newErrors.spotifyEmail = 'Invalid email format for Spotify email';
        }

        // Add validation for T&Cs and Privacy Policy
        if (!acceptedTerms) {
            newErrors.terms = 'You must accept the Terms & Conditions';
        }

        if (!acceptedPrivacy) {
            newErrors.privacy = 'You must accept the Privacy Policy';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Navigation handlers for T&Cs and Privacy Policy
    const goToTerms = () => {
        navigation.navigate('Terms');
    };

    const goToPrivacyPolicy = () => {
        navigation.navigate('PrivacyPolicy');
    };

    const handleSignup = async () => {
        if (!validateInputs()) {
            return;
        }

        setIsLoading(true);

        try {
            // Use primary email for Spotify if spotifyEmail is not provided
            const spotifyEmailToUse = spotifyEmail.trim() || email;

            // Prepare signup data, include a flag for first-time user
            // Set onboarding_complete to true since we're completing it during signup
            const signupData = {
                name,
                email,
                password,
                musicService,
                spotifyEmail: musicService === 'spotify' ? spotifyEmailToUse : undefined,
                isFirstTimeUser: false, // We're not using the welcome screen
                requiresEmailVerification: true, // Add this flag for new email verification flow
                onboarding_complete: true // Mark onboarding as complete since we've accepted T&Cs
            };

            console.log("Sending signup data:", {
                ...signupData,
                password: '******' // Don't log actual password
            });

            // Make API request
            const response = await axiosClient.post('/api/mobile/signup', signupData);
            const data = response.data as SignupResponse;

            if (data.success) {
                // Check if Spotify integration is in progress  
                if (data.requiresSpotifySetup) {
                    Alert.alert(
                        "Account Created",
                        "Your account has been created successfully. Your Spotify integration is being processed. Please check your email for verification and try logging in shortly.",
                        [
                            {
                                text: 'OK',
                                onPress: () => navigation.navigate('EmailVerification', { email })
                            }
                        ]
                    );
                } else {
                    navigation.navigate('EmailVerification', { email });
                }
            } else {
                throw new Error(data.message || 'Failed to create account');
            }
        } catch (error) {
            console.error('Signup error:', error);
            Alert.alert(
                'Error',
                error instanceof Error ? error.message : 'Failed to create account. Please try again.'
            );
        } finally {
            setIsLoading(false);
        }
    };
    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContainer}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>Join Tilki to discover venues that match your musical taste</Text>

                <View style={styles.form}>
                    <TextInput
                        style={[styles.input, errors.name ? styles.inputError : null]}
                        placeholder="Full Name"
                        value={name}
                        onChangeText={(text) => {
                            setName(text);
                            if (errors.name) {
                                setErrors({ ...errors, name: '' });
                            }
                        }}
                        autoCapitalize="words"
                        testID="name-input"
                    />
                    {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

                    <TextInput
                        style={[styles.input, errors.email ? styles.inputError : null]}
                        placeholder="Email"
                        value={email}
                        onChangeText={(text) => {
                            setEmail(text);
                            if (errors.email) {
                                setErrors({ ...errors, email: '' });
                            }
                        }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        testID="email-input"
                    />
                    {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

                    <TextInput
                        style={[styles.input, errors.password ? styles.inputError : null]}
                        placeholder="Password"
                        value={password}
                        onChangeText={(text) => {
                            setPassword(text);
                            if (errors.password) {
                                setErrors({ ...errors, password: '' });
                            }
                        }}
                        secureTextEntry
                        testID="password-input"
                    />

                    <View style={styles.passwordRequirements}>
                        {passwordRequirements.map((req, index) => (
                            <View key={index} style={styles.requirementRow}>
                                <Text style={[
                                    styles.requirementDot,
                                    req.test(password) ? styles.requirementMet : styles.requirementUnmet
                                ]}>●</Text>
                                <Text style={[
                                    styles.requirementText,
                                    req.test(password) ? styles.requirementMet : styles.requirementUnmet
                                ]}>{req.text}</Text>
                            </View>
                        ))}
                    </View>
                    {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

                    <View style={[styles.pickerContainer, errors.musicService ? styles.inputError : null]}>
                        <Picker
                            selectedValue={musicService}
                            onValueChange={(value, index) => {
                                const selectedItem = MUSIC_SERVICES.find(service => service.value === value);
                                if (selectedItem?.disabled) return;

                                setMusicService(value);

                                if (errors.musicService) {
                                    setErrors({ ...errors, musicService: '' });
                                }
                            }}
                            style={styles.picker}
                            dropdownIconColor="#FFFFFF"
                        >
                            {MUSIC_SERVICES.map((service) => (
                                <Picker.Item
                                    key={service.value}
                                    label={
                                        service.disabled
                                            ? `\u0336${service.label.split('').join('\u0336')}` // adds strikethrough to each letter
                                            : service.label
                                    }
                                    value={service.value}
                                    color={service.disabled ? '#999999' : '#000000'}
                                />
                            ))}
                        </Picker>
                    </View>
                    {errors.musicService ? <Text style={styles.errorText}>{errors.musicService}</Text> : null}

                    {musicService === 'spotify' && (
                        <>
                            <TextInput
                                style={[styles.input, errors.spotifyEmail ? styles.inputError : null]}
                                placeholder="Spotify Email (leave blank if same as above)"
                                value={spotifyEmail}
                                onChangeText={(text) => {
                                    setSpotifyEmail(text);
                                    if (errors.spotifyEmail) {
                                        setErrors({ ...errors, spotifyEmail: '' });
                                    }
                                }}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                testID="spotify-email-input"
                            />
                            {errors.spotifyEmail ? <Text style={styles.errorText}>{errors.spotifyEmail}</Text> : null}
                        </>
                    )}

                    {/* Terms & Conditions Checkbox */}
                    <View style={styles.checkboxContainer}>
                        <TouchableOpacity
                            style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}
                            onPress={() => {
                                setAcceptedTerms(!acceptedTerms);
                                if (errors.terms) {
                                    setErrors({ ...errors, terms: '' });
                                }
                            }}
                        >
                            {acceptedTerms && <Text style={styles.checkmark}>✓</Text>}
                        </TouchableOpacity>
                        <View style={styles.checkboxTextContainer}>
                            <Text style={styles.checkboxText}>I accept the </Text>
                            <TouchableOpacity onPress={goToTerms}>
                                <Text style={styles.linkText}>Terms & Conditions</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    {errors.terms ? <Text style={styles.errorText}>{errors.terms}</Text> : null}

                    {/* Privacy Policy Checkbox */}
                    <View style={styles.checkboxContainer}>
                        <TouchableOpacity
                            style={[styles.checkbox, acceptedPrivacy && styles.checkboxChecked]}
                            onPress={() => {
                                setAcceptedPrivacy(!acceptedPrivacy);
                                if (errors.privacy) {
                                    setErrors({ ...errors, privacy: '' });
                                }
                            }}
                        >
                            {acceptedPrivacy && <Text style={styles.checkmark}>✓</Text>}
                        </TouchableOpacity>
                        <View style={styles.checkboxTextContainer}>
                            <Text style={styles.checkboxText}>I accept the </Text>
                            <TouchableOpacity onPress={goToPrivacyPolicy}>
                                <Text style={styles.linkText}>Privacy Policy</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    {errors.privacy ? <Text style={styles.errorText}>{errors.privacy}</Text> : null}

                    <TouchableOpacity
                        style={[styles.button, isLoading ? styles.buttonDisabled : null]}
                        onPress={handleSignup}
                        disabled={isLoading}
                        testID="signup-button"
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                            <Text style={styles.buttonText}>Create Account</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.loginLink}
                        onPress={() => navigation.navigate('Login')}
                        disabled={isLoading}
                    >
                        <Text style={styles.loginLinkText}>Already have an account? Log in</Text>
                    </TouchableOpacity>
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
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 10,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: '#CCCCCC',
        marginBottom: 30,
        textAlign: 'center',
    },
    form: {
        width: '100%',
    },
    input: {
        backgroundColor: '#FFFFFF',
        padding: 15,
        borderRadius: 5,
        marginBottom: 15,
        color: '#000000',
    },
    inputError: {
        borderWidth: 1,
        borderColor: '#FF4D4F',
    },
    errorText: {
        color: '#FF4D4F',
        marginBottom: 15,
        marginTop: -10,
    },
    passwordRequirements: {
        marginBottom: 15,
        paddingHorizontal: 5,
    },
    requirementRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    requirementDot: {
        marginRight: 8,
        fontSize: 12,
    },
    requirementText: {
        fontSize: 14,
    },
    requirementMet: {
        color: '#D35400', // Theme color
    },
    requirementUnmet: {
        color: '#FFFFFF',
        opacity: 0.7,
    },
    pickerContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 5,
        marginBottom: 15,
        overflow: 'hidden',
    },
    picker: {
        backgroundColor: '#FFFFFF',
        color: '#000000',
    },
    button: {
        backgroundColor: '#D35400',
        padding: 15,
        borderRadius: 5,
        alignItems: 'center',
        marginBottom: 15,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    loginLink: {
        alignItems: 'center',
        padding: 10,
    },
    loginLinkText: {
        color: '#D35400',
        fontSize: 14,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderWidth: 2,
        borderColor: '#D35400',
        borderRadius: 4,
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxChecked: {
        backgroundColor: '#D35400',
    },
    checkmark: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    checkboxTextContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        flex: 1,
    },
    checkboxText: {
        color: '#FFFFFF',
        fontSize: 14,
    },
    linkText: {
        color: '#D35400',
        fontSize: 14,
        textDecorationLine: 'underline',
    },
});

export default SignupScreen;