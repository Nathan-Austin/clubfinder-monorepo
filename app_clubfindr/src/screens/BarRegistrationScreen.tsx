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
    Alert,
    Switch
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation';
import { Picker } from '@react-native-picker/picker';
import axiosClient from '../api/axiosClient';

type BarRegistrationScreenNavigationProp = StackNavigationProp<RootStackParamList, 'BarRegistration'>;

// Step-by-step form for bar registration
enum RegistrationStep {
    BusinessInfo = 0,
    ContactInfo = 1,
    LocationInfo = 2,
    BarDetails = 3,
    MusicService = 4,
    CreatePassword = 5,
    Review = 6
}

const BarRegistrationScreen = () => {
    const navigation = useNavigation<BarRegistrationScreenNavigationProp>();

    // Form state
    const [currentStep, setCurrentStep] = useState<RegistrationStep>(RegistrationStep.BusinessInfo);
    const [businessName, setBusinessName] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [postcode, setPostcode] = useState('');
    const [cityName, setCityName] = useState('');
    const [website, setWebsite] = useState('');
    const [musicService, setMusicService] = useState('');
    const [musicServiceEmail, setMusicServiceEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [agreeToTerms, setAgreeToTerms] = useState(false);
    const [agreeToPrivacyPolicy, setAgreeToPrivacyPolicy] = useState(false);
    
    const [smokingAllowed, setSmokingAllowed] = useState(false);
    const [barTypes, setBarTypes] = useState<string[]>([]);

    const BAR_TYPES = [
        { value: 'cocktail', label: 'Cocktail Bar' },
        { value: 'pub', label: 'Pub' },
        { value: 'club', label: 'Nightclub' },
        { value: 'dive', label: 'Dive Bar' },
        { value: 'wine', label: 'Wine Bar' },
        { value: 'beer', label: 'Beer Garden/Hall' },
        { value: 'lounge', label: 'Lounge' },
        { value: 'sports', label: 'Sports Bar' },
        { value: 'music', label: 'Live Music Venue' },
        { value: 'speakeasy', label: 'Speakeasy' }
    ];

    // Error states
    const [businessNameError, setBusinessNameError] = useState('');
    const [emailError, setEmailError] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
    const [cityError, setCityError] = useState('');

    // Loading state
    const [isSubmitting, setIsSubmitting] = useState(false);

    // City options - this could be fetched from an API instead
    const cityOptions = ['Berlin', 'London', 'Paris', 'Amsterdam', 'Madrid', 'Barcelona', 'Rome', 'New York'];

    // Music service options
    const musicServiceOptions = [
        { label: 'Select a music service', value: '', disabled: false },
        { label: 'Spotify', value: 'Spotify', disabled: false },
        { label: 'Apple Music', value: 'Apple Music', disabled: true },
        { label: 'Soundcloud', value: 'Soundcloud', disabled: true },
        { label: 'Other', value: 'Other', disabled: false }
    ];

    // Validation functions
    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValid = emailRegex.test(email);
        setEmailError(isValid ? '' : 'Please enter a valid email address');
        return isValid;
    };

    const validatePhone = (phone: string): boolean => {
        // Allow +, spaces, and numbers
        const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
        const isValid = phoneRegex.test(phone);
        setPhoneError(isValid ? '' : 'Please enter a valid phone number');
        return isValid;
    };

    const validateBusinessName = (name: string): boolean => {
        const isValid = name.length >= 2 && name.length <= 100;
        setBusinessNameError(isValid ? '' : 'Business name must be between 2 and 100 characters');
        return isValid;
    };

    const validateCity = (city: string): boolean => {
        if (!city) {
            setCityError('Please select a city');
            return false;
        }
        setCityError('');
        return true;
    };

    const validatePassword = (pw: string): { valid: boolean, errors: string[] } => {
        const errors: string[] = [];

        if (pw.length < 8) {
            errors.push('Password must be at least 8 characters');
        }

        if (!/[A-Z]/.test(pw)) {
            errors.push('Password must contain at least one uppercase letter');
        }

        if (!/[a-z]/.test(pw)) {
            errors.push('Password must contain at least one lowercase letter');
        }

        if (!/[0-9]/.test(pw)) {
            errors.push('Password must contain at least one number');
        }

        if (!/[^A-Za-z0-9]/.test(pw)) {
            errors.push('Password must contain at least one special character');
        }

        if (pw !== confirmPassword) {
            errors.push('Passwords do not match');
        }

        setPasswordErrors(errors);
        return { valid: errors.length === 0, errors };
    };

    // Handle next step
    const handleNextStep = () => {
        // Validate current step before proceeding
        if (!validateCurrentStep()) {
            return;
        }

        if (currentStep < RegistrationStep.Review) {
            setCurrentStep(currentStep + 1);
        } else {
            handleSubmit();
        }
    };

    // Handle back
    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        } else {
            navigation.goBack();
        }
    };

    // Validate current step
    const validateCurrentStep = (): boolean => {
        switch (currentStep) {
            case RegistrationStep.BusinessInfo:
                return validateBusinessName(businessName);

            case RegistrationStep.ContactInfo:
                return validateEmail(email) && validatePhone(phone);

            case RegistrationStep.LocationInfo:
                return validateCity(cityName);

            case RegistrationStep.BarDetails:
                return true; // Optional fields

            case RegistrationStep.MusicService:
                if (!musicService) {
                    Alert.alert('Required Field', 'Please select a music service');
                    return false;
                }
                if (musicService === 'Spotify' && !validateEmail(musicServiceEmail)) {
                    return false;
                }
                return true;

            case RegistrationStep.CreatePassword:
                const { valid } = validatePassword(password);
                return valid;

            case RegistrationStep.Review:
                if (!agreeToTerms || !agreeToPrivacyPolicy) {
                    Alert.alert('Required Agreement', 'You must agree to both the Terms and Conditions and Privacy Policy');
                    return false;
                }
                return true;

            default:
                return true;
        }
    };

    // Submit the form
    const handleSubmit = async () => {
        if (isSubmitting) return;

        if (!agreeToTerms || !agreeToPrivacyPolicy) {
            Alert.alert('Required Agreement', 'You must agree to both the Terms and Conditions and Privacy Policy');
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await axiosClient.post('/api/mobile/bars/register', {
                businessName,
                contactPerson,
                email,
                phone,
                address,
                postcode,
                cityName,
                website,
                musicService,
                musicServiceEmail,
                password,
                smokingAllowed,
                barTypes
            });

            if (response.data.success) {
                Alert.alert(
                    'Registration Successful',
                    'Your bar registration has been submitted. Please check your email for a confirmation code.',
                    [
                        {
                            text: 'OK',
                            onPress: () => navigation.navigate('BarConfirmation', { email })
                        }
                    ]
                );
            } else {
                Alert.alert('Registration Failed', response.data.message || 'Please try again');
            }
        } catch (error) {
            console.error('Registration error:', error);
            Alert.alert(
                'Registration Error',
                'There was an error submitting your registration. Please try again later.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    // View Terms & Conditions
    const viewTerms = () => {
        // Navigate to Terms screen
        navigation.navigate('Terms');
    };

    // View Privacy Policy
    const viewPrivacyPolicy = () => {
        // Navigate to Privacy Policy screen
        navigation.navigate('PrivacyPolicy');
    };

    // Render current step content
    const renderStepContent = () => {
        switch (currentStep) {
            case RegistrationStep.BusinessInfo:
                return (
                    <>
                        <Text style={styles.stepTitle}>Business Information</Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Business Name *</Text>
                            <TextInput
                                style={[styles.input, businessNameError ? styles.inputError : null]}
                                value={businessName}
                                onChangeText={(text) => {
                                    setBusinessName(text);
                                    if (businessNameError) validateBusinessName(text);
                                }}
                                placeholder="Enter your bar or club name"
                                placeholderTextColor="#999"
                                autoComplete="organization"
                                textContentType="organizationName"
                            />
                            {businessNameError ? <Text style={styles.errorText}>{businessNameError}</Text> : null}
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Contact Person *</Text>
                            <TextInput
                                style={styles.input}
                                value={contactPerson}
                                onChangeText={setContactPerson}
                                placeholder="Full name of contact person"
                                placeholderTextColor="#999"
                                autoComplete="name"
                                textContentType="name"
                            />
                        </View>
                    </>
                );

            case RegistrationStep.ContactInfo:
                return (
                    <>
                        <Text style={styles.stepTitle}>Contact Information</Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Email Address *</Text>
                            <TextInput
                                style={[styles.input, emailError ? styles.inputError : null]}
                                value={email}
                                onChangeText={(text) => {
                                    setEmail(text);
                                    if (emailError) validateEmail(text);
                                }}
                                placeholder="youremail@example.com"
                                placeholderTextColor="#999"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoComplete="email"
                                textContentType="emailAddress"
                            />
                            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Phone Number *</Text>
                            <TextInput
                                style={[styles.input, phoneError ? styles.inputError : null]}
                                value={phone}
                                onChangeText={(text) => {
                                    setPhone(text);
                                    if (phoneError) validatePhone(text);
                                }}
                                placeholder="+1 123 456 7890"
                                placeholderTextColor="#999"
                                keyboardType="phone-pad"
                                autoComplete="tel"
                                textContentType="telephoneNumber"
                            />
                            {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
                        </View>
                    </>
                );

            case RegistrationStep.LocationInfo:
                return (
                    <>
                        <Text style={styles.stepTitle}>Location Information</Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Street Address *</Text>
                            <TextInput
                                style={styles.input}
                                value={address}
                                onChangeText={setAddress}
                                placeholder="Street name and number"
                                placeholderTextColor="#999"
                                autoComplete="address-line1"
                                textContentType="streetAddressLine1"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Postcode *</Text>
                            <TextInput
                                style={styles.input}
                                value={postcode}
                                onChangeText={setPostcode}
                                placeholder="Postal/Zip code"
                                placeholderTextColor="#999"
                                autoComplete="postal-code"
                                textContentType="postalCode"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>City *</Text>
                            <View style={[styles.pickerContainer, cityError ? styles.inputError : null]}>
                                <Picker
                                    selectedValue={cityName}
                                    onValueChange={(value) => {
                                        setCityName(value);
                                        validateCity(value);
                                    }}
                                    style={styles.picker}
                                    dropdownIconColor="#FFFFFF"
                                >
                                    <Picker.Item label="Select a city" value="" color="#999999" />
                                    {cityOptions.map((city) => (
                                        <Picker.Item 
                                            key={city} 
                                            label={city} 
                                            value={city} 
                                            color={Platform.OS === 'android' ? "#000000" : "#FFFFFF"} 
                                        />
                                    ))}
                                </Picker>
                            </View>
                            {cityError ? <Text style={styles.errorText}>{cityError}</Text> : null}
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Website/Social Media</Text>
                            <TextInput
                                style={styles.input}
                                value={website}
                                onChangeText={setWebsite}
                                placeholder="https://yourwebsite.com"
                                placeholderTextColor="#999"
                                keyboardType="url"
                                autoCapitalize="none"
                                autoComplete="url"
                                textContentType="URL"
                            />
                        </View>
                    </>
                );

            case RegistrationStep.BarDetails:
                return (
                    <>
                        <Text style={styles.stepTitle}>Bar Details</Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Smoking Allowed Inside?</Text>
                            <View style={styles.switchContainer}>
                                <Text style={styles.switchLabel}>{smokingAllowed ? 'Yes' : 'No'}</Text>
                                <Switch
                                    trackColor={{ false: "#767577", true: "#D35400" }}
                                    thumbColor={smokingAllowed ? "#FFFFFF" : "#f4f3f4"}
                                    ios_backgroundColor="#3e3e3e"
                                    onValueChange={setSmokingAllowed}
                                    value={smokingAllowed}
                                />
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Bar Type (Select up to 3)</Text>
                            <View style={styles.chipsContainer}>
                                {BAR_TYPES.map((type) => (
                                    <TouchableOpacity
                                        key={type.value}
                                        style={[
                                            styles.chip,
                                            barTypes.includes(type.value) && styles.chipSelected
                                        ]}
                                        onPress={() => {
                                            if (barTypes.includes(type.value)) {
                                                setBarTypes(barTypes.filter(t => t !== type.value));
                                            } else if (barTypes.length < 3) {
                                                setBarTypes([...barTypes, type.value]);
                                            }
                                        }}
                                        disabled={!barTypes.includes(type.value) && barTypes.length >= 3}
                                    >
                                        <Text style={[
                                            styles.chipText,
                                            barTypes.includes(type.value) && styles.chipTextSelected
                                        ]}>
                                            {type.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </>
                );

            case RegistrationStep.MusicService:
                return (
                    <>
                        <Text style={styles.stepTitle}>Music Service</Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Preferred Music Service *</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={musicService}
                                    onValueChange={(value) => setMusicService(value)}
                                    style={styles.picker}
                                    dropdownIconColor="#FFFFFF"
                                >
                                    {musicServiceOptions.map((option) => (
                                        <Picker.Item
                                            key={option.value}
                                            label={option.label}
                                            value={option.value}
                                            color={option.disabled ? '#999999' : (Platform.OS === 'android' ? '#000000' : '#FFFFFF')}
                                            enabled={!option.disabled}
                                        />
                                    ))}
                                </Picker>
                            </View>
                        </View>

                        {musicService === 'Spotify' && (
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Spotify Email *</Text>
                                <TextInput
                                    style={[styles.input, emailError && musicServiceEmail ? styles.inputError : null]}
                                    value={musicServiceEmail}
                                    onChangeText={(text) => {
                                        setMusicServiceEmail(text);
                                        if (emailError) validateEmail(text);
                                    }}
                                    placeholder="Your Spotify account email"
                                    placeholderTextColor="#999"
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoComplete="email"
                                    textContentType="emailAddress"
                                />
                                {emailError && musicServiceEmail ? <Text style={styles.errorText}>{emailError}</Text> : null}
                            </View>
                        )}

                        <Text style={styles.noteText}>
                            Note: We'll integrate with your selected music service to help customers find venues that match their musical taste.
                        </Text>
                    </>
                );

            case RegistrationStep.CreatePassword:
                return (
                    <>
                        <Text style={styles.stepTitle}>Create Password</Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Password *</Text>
                            <TextInput
                                style={[styles.input, passwordErrors.length > 0 ? styles.inputError : null]}
                                value={password}
                                onChangeText={setPassword}
                                placeholder="Create a strong password"
                                placeholderTextColor="#999"
                                secureTextEntry
                                autoCapitalize="none"
                                autoComplete="password-new"
                                textContentType="newPassword"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Confirm Password *</Text>
                            <TextInput
                                style={[styles.input, passwordErrors.length > 0 ? styles.inputError : null]}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                placeholder="Enter the same password again"
                                placeholderTextColor="#999"
                                secureTextEntry
                                autoCapitalize="none"
                                autoComplete="password-new"
                                textContentType="newPassword"
                            />
                        </View>

                        {passwordErrors.length > 0 && (
                            <View style={styles.passwordRequirements}>
                                <Text style={styles.requirementsTitle}>Password Requirements:</Text>
                                {passwordErrors.map((error, index) => (
                                    <Text key={index} style={styles.errorText}>• {error}</Text>
                                ))}
                            </View>
                        )}
                    </>
                );

            case RegistrationStep.Review:
                return (
                    <>
                        <Text style={styles.stepTitle}>Review & Submit</Text>

                        <View style={styles.reviewSection}>
                            <Text style={styles.reviewTitle}>Business Information</Text>
                            <Text style={styles.reviewItem}>
                                <Text style={styles.reviewLabel}>Business Name: </Text>
                                {businessName}
                            </Text>
                            <Text style={styles.reviewItem}>
                                <Text style={styles.reviewLabel}>Contact Person: </Text>
                                {contactPerson}
                            </Text>
                        </View>

                        <View style={styles.reviewSection}>
                            <Text style={styles.reviewTitle}>Contact Information</Text>
                            <Text style={styles.reviewItem}>
                                <Text style={styles.reviewLabel}>Email: </Text>
                                {email}
                            </Text>
                            <Text style={styles.reviewItem}>
                                <Text style={styles.reviewLabel}>Phone: </Text>
                                {phone}
                            </Text>
                        </View>

                        <View style={styles.reviewSection}>
                            <Text style={styles.reviewTitle}>Location</Text>
                            <Text style={styles.reviewItem}>
                                <Text style={styles.reviewLabel}>Address: </Text>
                                {address}
                            </Text>
                            <Text style={styles.reviewItem}>
                                <Text style={styles.reviewLabel}>Postcode: </Text>
                                {postcode}
                            </Text>
                            <Text style={styles.reviewItem}>
                                <Text style={styles.reviewLabel}>City: </Text>
                                {cityName}
                            </Text>
                            {website && (
                                <Text style={styles.reviewItem}>
                                    <Text style={styles.reviewLabel}>Website: </Text>
                                    {website}
                                </Text>
                            )}
                        </View>

                        <View style={styles.reviewSection}>
                            <Text style={styles.reviewTitle}>Details</Text>
                            <Text style={styles.reviewItem}>
                                <Text style={styles.reviewLabel}>Smoking Allowed: </Text>
                                {smokingAllowed ? 'Yes' : 'No'}
                            </Text>
                            {barTypes.length > 0 && (
                                <Text style={styles.reviewItem}>
                                    <Text style={styles.reviewLabel}>Bar Types: </Text>
                                    {barTypes.map(t => BAR_TYPES.find(bt => bt.value === t)?.label).join(', ')}
                                </Text>
                            )}
                        </View>

                        <View style={styles.reviewSection}>
                            <Text style={styles.reviewTitle}>Music Service</Text>
                            <Text style={styles.reviewItem}>
                                <Text style={styles.reviewLabel}>Service: </Text>
                                {musicService}
                            </Text>
                            {musicService === 'Spotify' && (
                                <Text style={styles.reviewItem}>
                                    <Text style={styles.reviewLabel}>Spotify Email: </Text>
                                    {musicServiceEmail}
                                </Text>
                            )}
                        </View>

                        <View style={styles.checkboxContainer}>
                            <TouchableOpacity
                                style={styles.checkbox}
                                onPress={() => setAgreeToTerms(!agreeToTerms)}
                            >
                                <View style={[styles.checkboxBox, agreeToTerms && styles.checkboxChecked]}>
                                    {agreeToTerms && <Text style={styles.checkmark}>✓</Text>}
                                </View>
                                <View style={styles.checkboxTextContainer}>
                                    <Text style={styles.checkboxText}>
                                        I agree to the
                                        <Text style={styles.linkText} onPress={viewTerms}> Terms and Conditions</Text>
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.checkboxContainer}>
                            <TouchableOpacity
                                style={styles.checkbox}
                                onPress={() => setAgreeToPrivacyPolicy(!agreeToPrivacyPolicy)}
                            >
                                <View style={[styles.checkboxBox, agreeToPrivacyPolicy && styles.checkboxChecked]}>
                                    {agreeToPrivacyPolicy && <Text style={styles.checkmark}>✓</Text>}
                                </View>
                                <View style={styles.checkboxTextContainer}>
                                    <Text style={styles.checkboxText}>
                                        I consent to the processing of my personal data in accordance with the
                                        <Text style={styles.linkText} onPress={viewPrivacyPolicy}> Privacy Policy</Text>
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </>
                );

            default:
                return null;
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0}
        >
            <ScrollView contentContainerStyle={styles.scrollContainer}>
                <View style={styles.stepIndicatorContainer}>
                    {[...Array(7)].map((_, index) => (
                        <View
                            key={index}
                            style={[
                                styles.stepDot,
                                currentStep >= index ? styles.stepDotActive : styles.stepDotInactive
                            ]}
                        />
                    ))}
                </View>

                <View style={styles.formContainer}>
                    {renderStepContent()}

                    <View style={styles.buttonsContainer}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={handleBack}
                        >
                            <Text style={styles.backButtonText}>Back</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.nextButton}
                            onPress={handleNextStep}
                            disabled={isSubmitting}
                        >
                            {isSubmitting && currentStep === RegistrationStep.Review ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <Text style={styles.nextButtonText}>
                                    {currentStep === RegistrationStep.Review ? 'Submit' : 'Next'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
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
    stepIndicatorContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 20,
    },
    stepDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginHorizontal: 5,
    },
    stepDotActive: {
        backgroundColor: '#D35400',
    },
    stepDotInactive: {
        backgroundColor: '#555555',
    },
    formContainer: {
        backgroundColor: '#222222',
        borderRadius: 10,
        padding: 20,
    },
    stepTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 20,
        textAlign: 'center',
    },
    inputGroup: {
        marginBottom: 20,
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
    inputError: {
        borderWidth: 1,
        borderColor: '#FF4D4F',
    },
    errorText: {
        color: '#FF4D4F',
        fontSize: 12,
        marginTop: 5,
    },
    pickerContainer: {
        backgroundColor: '#333333',
        borderRadius: 5,
        overflow: 'hidden',
    },
    picker: {
        color: '#FFFFFF',
        backgroundColor: '#333333',
    },
    noteText: {
        color: '#CCCCCC',
        fontSize: 14,
        fontStyle: 'italic',
        marginTop: 10,
    },
    passwordRequirements: {
        backgroundColor: '#333333',
        padding: 15,
        borderRadius: 5,
        marginBottom: 20,
    },
    requirementsTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        marginBottom: 10,
    },
    buttonsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
    },
    backButton: {
        backgroundColor: '#333333',
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 5,
        flex: 1,
        marginRight: 10,
        alignItems: 'center',
    },
    backButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    nextButton: {
        backgroundColor: '#D35400',
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 5,
        flex: 1,
        marginLeft: 10,
        alignItems: 'center',
    },
    nextButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    reviewSection: {
        marginBottom: 20,
        backgroundColor: '#333333',
        padding: 15,
        borderRadius: 5,
    },
    reviewTitle: {
        color: '#D35400',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    reviewItem: {
        color: '#FFFFFF',
        fontSize: 14,
        marginBottom: 5,
    },
    reviewLabel: {
        fontWeight: 'bold',
    },
    checkboxContainer: {
        marginBottom: 15,
    },
    checkbox: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkboxBox: {
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
        flex: 1,
    },
    checkboxText: {
        color: '#FFFFFF',
        fontSize: 14,
    },
    linkText: {
        color: '#D35400',
        textDecorationLine: 'underline',
    },
    switchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#333333',
        padding: 15,
        borderRadius: 5,
    },
    switchLabel: {
        color: '#FFFFFF',
        fontSize: 16,
    },
    chipsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    chip: {
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#333333',
        borderWidth: 1,
        borderColor: '#555',
        marginBottom: 8,
    },
    chipSelected: {
        backgroundColor: '#D35400',
        borderColor: '#D35400',
    },
    chipText: {
        color: '#FFFFFF',
        fontSize: 14,
    },
    chipTextSelected: {
        fontWeight: 'bold',
    },
});

export default BarRegistrationScreen;