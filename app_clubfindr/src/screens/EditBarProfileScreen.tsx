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
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosClient from '../api/axiosClient';
import { Ionicons } from '@expo/vector-icons';

// Simplified navigation type
type EditBarProfileScreenNavigationProp = StackNavigationProp<any>;

interface BarProfile {
    id: string;
    name: string;
    address: string;
    city: string;
    phone: string;
    general_email: string;
    opening_hours: string;
    description: string;
}

const EditBarProfileScreen = () => {
    const navigation = useNavigation<EditBarProfileScreenNavigationProp>();

    // State for profile fields
    const [profile, setProfile] = useState<BarProfile>({
        id: '',
        name: '',
        address: '',
        city: '',
        phone: '',
        general_email: '',
        opening_hours: '',
        description: ''
    });

    // UI state
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Load bar profile data
    useEffect(() => {
        loadBarProfile();
    }, []);

    const loadBarProfile = async () => {
        setLoading(true);
        try {
            const barId = await AsyncStorage.getItem('barId');
            console.log('Retrieved barId:', barId);

            if (!barId) {
                Alert.alert('Error', 'Bar ID not found. Please log in again.');
                return;
            }

            console.log('Making API request to:', `/api/mobile/bars/${barId}`);
            const response = await axiosClient.get(`/api/mobile/bars/${barId}`);
            console.log('API Response:', response.data);

            const profileData = response.data;
            console.log('Setting profile data:', profileData);

            // Map the API response fields to our profile structure
            const mappedProfile = {
                id: profileData.id || '',
                name: profileData.name || '',
                address: profileData.address || '',
                city: profileData.city || '',
                phone: profileData.phone || '',
                general_email: profileData.general_email || '',
                opening_hours: '', // This field might come from a different endpoint
                description: profileData.description || ''
            };

            console.log('Mapped profile data:', mappedProfile);
            setProfile(mappedProfile);
        } catch (error: any) {
            console.error('Error loading bar profile:', error);
            console.error('Error details:', error.response?.data);
            Alert.alert('Error', 'Failed to load bar profile. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Update profile field
    const updateField = (field: keyof BarProfile, value: string) => {
        setProfile(prev => ({
            ...prev,
            [field]: value
        }));

        // Clear error for this field if exists
        if (errors[field]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    // Validate the form
    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!profile.name.trim()) {
            newErrors.name = 'Bar name is required';
        }

        if (!profile.address.trim()) {
            newErrors.address = 'Address is required';
        }

        if (!profile.city.trim()) {
            newErrors.city = 'City is required';
        }

        if (!profile.phone.trim()) {
            newErrors.phone = 'Phone number is required';
        } else {
            // Simple validation for phone
            const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
            if (!phoneRegex.test(profile.phone.trim())) {
                newErrors.phone = 'Invalid phone number format';
            }
        }

        if (!profile.general_email.trim()) {
            newErrors.general_email = 'Email is required';
        } else {
            // Simple validation for email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(profile.general_email.trim())) {
                newErrors.general_email = 'Invalid email format';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Handle form submission
    const handleSubmit = async () => {
        if (!validateForm()) {
            return;
        }

        setSubmitting(true);
        try {
            // Only send fields that are actually used by the API
            const response = await axiosClient.patch(`/api/mobile/bars/${profile.id}`, {
                name: profile.name,
                address: profile.address,
                city: profile.city,
                phone: profile.phone,
                general_email: profile.general_email,
                description: profile.description
            });

            // Update bar name in storage if it changed
            await AsyncStorage.setItem('barName', profile.name);

            Alert.alert(
                'Success',
                'Profile updated successfully',
                [
                    {
                        text: 'OK',
                        onPress: () => navigation.goBack()
                    }
                ]
            );
        } catch (error: any) {
            console.error('Error updating profile:', error);
            console.error('Error details:', error.response?.data);
            Alert.alert('Error', error.response?.data?.message || 'Failed to update profile. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#D35400" />
                <Text style={styles.loadingText}>Loading profile...</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
            <ScrollView style={styles.scrollView}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Edit Bar Profile</Text>
                </View>

                <View style={styles.form}>
                    {/* Bar Name */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Bar Name *</Text>
                        <TextInput
                            style={[styles.input, errors.name ? styles.inputError : null]}
                            value={profile.name}
                            onChangeText={(value) => updateField('name', value)}
                            placeholder="Your bar's name"
                            placeholderTextColor="#888"
                            autoComplete="organization"
                            textContentType="organizationName"
                            importantForAutofill="yes"
                        />
                        {errors.name ? (
                            <Text style={styles.errorText}>{errors.name}</Text>
                        ) : null}
                    </View>

                    {/* Address */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Address *</Text>
                        <TextInput
                            style={[styles.input, errors.address ? styles.inputError : null]}
                            value={profile.address}
                            onChangeText={(value) => updateField('address', value)}
                            placeholder="Street address"
                            placeholderTextColor="#888"
                            autoComplete="address-line1"
                            textContentType="streetAddressLine1"
                            importantForAutofill="yes"
                        />
                        {errors.address ? (
                            <Text style={styles.errorText}>{errors.address}</Text>
                        ) : null}
                    </View>

                    {/* City */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>City *</Text>
                        <TextInput
                            style={[styles.input, errors.city ? styles.inputError : null]}
                            value={profile.city}
                            onChangeText={(value) => updateField('city', value)}
                            placeholder="City"
                            placeholderTextColor="#888"
                            autoComplete="address-level2"
                            textContentType="addressCity"
                            importantForAutofill="yes"
                        />
                        {errors.city ? (
                            <Text style={styles.errorText}>{errors.city}</Text>
                        ) : null}
                    </View>

                    {/* Phone */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Phone Number *</Text>
                        <TextInput
                            style={[styles.input, errors.phone ? styles.inputError : null]}
                            value={profile.phone}
                            onChangeText={(value) => updateField('phone', value)}
                            placeholder="Phone number"
                            placeholderTextColor="#888"
                            keyboardType="phone-pad"
                            autoComplete="tel"
                            textContentType="telephoneNumber"
                            importantForAutofill="yes"
                        />
                        {errors.phone ? (
                            <Text style={styles.errorText}>{errors.phone}</Text>
                        ) : null}
                    </View>

                    {/* Email */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Email *</Text>
                        <TextInput
                            style={[styles.input, errors.general_email ? styles.inputError : null]}
                            value={profile.general_email}
                            onChangeText={(value) => updateField('general_email', value)}
                            placeholder="Contact email"
                            placeholderTextColor="#888"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoComplete="email"
                            textContentType="emailAddress"
                            importantForAutofill="yes"
                        />
                        {errors.general_email ? (
                            <Text style={styles.errorText}>{errors.general_email}</Text>
                        ) : null}
                    </View>

                    {/* Description */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Description</Text>
                        <TextInput
                            style={styles.textArea}
                            value={profile.description}
                            onChangeText={(value) => updateField('description', value)}
                            placeholder="Tell customers about your bar's atmosphere, music style, and what makes it special."
                            placeholderTextColor="#888"
                            multiline
                            numberOfLines={6}
                            textAlignVertical="top"
                            autoComplete="off"
                            textContentType="none"
                        />
                    </View>

                    {/* Submit and Cancel Buttons */}
                    <View style={styles.buttonGroup}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => navigation.goBack()}
                            disabled={submitting}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.submitButton}
                            onPress={handleSubmit}
                            disabled={submitting}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <Text style={styles.submitButtonText}>Update Profile</Text>
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
    scrollView: {
        flex: 1,
    },
    header: {
        backgroundColor: '#D35400',
        padding: 20,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#121212',
    },
    loadingText: {
        color: '#CCCCCC',
        marginTop: 10,
    },
    form: {
        padding: 20,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        color: '#FFFFFF',
        fontSize: 16,
        marginBottom: 8,
        fontWeight: '500',
    },
    input: {
        backgroundColor: '#2A2A2A',
        color: '#FFFFFF',
        padding: 12,
        borderRadius: 6,
        fontSize: 16,
    },
    inputError: {
        borderWidth: 1,
        borderColor: '#FF5252',
    },
    errorText: {
        color: '#FF5252',
        fontSize: 14,
        marginTop: 5,
    },
    textArea: {
        backgroundColor: '#2A2A2A',
        color: '#FFFFFF',
        padding: 12,
        borderRadius: 6,
        fontSize: 16,
        minHeight: 100,
    },
    buttonGroup: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
        marginBottom: 30,
    },
    cancelButton: {
        backgroundColor: '#444',
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 6,
        flex: 1,
        marginRight: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '500',
    },
    submitButton: {
        backgroundColor: '#D35400',
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 6,
        flex: 1,
        marginLeft: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '500',
    },
});

export default EditBarProfileScreen;
