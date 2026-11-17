import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Platform,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    ScrollView
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { enGB, registerTranslation } from 'react-native-paper-dates';
import axiosClient from '../api/axiosClient';
import { useVenue } from '../contexts/VenueContext';
import GenreChipsInput from '../components/GenreChipsInput';
import type { BarStackParamList } from '../navigation';
import EventWhenSection from '../components/eventForm/EventWhenSection';
import EventRecurrenceSection from '../components/eventForm/EventRecurrenceSection';
import { fromLocalIsoDate } from '../utils/localDate';
import { parseTimeString, toEventPayload, validateEventForm, type EventFormErrors } from '../utils/eventFormValues';
import { colors } from '../theme';

// Types
interface BarEvent {
    id: string;
    theme_name: string;
    description: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    recurring: boolean;
    recurrence_pattern: string | null;
    special_genres: string[];
}

type RouteParams = {
    EditEvent: {
        event: BarEvent;
    };
    AddEvent: undefined;
};

type EventFormScreenRouteProp = RouteProp<RouteParams, 'EditEvent' | 'AddEvent'>;
type EventFormScreenNavigationProp = StackNavigationProp<BarStackParamList>;

// Register the English locale
registerTranslation('en', enGB);

const EventFormScreen = () => {
    const navigation = useNavigation<EventFormScreenNavigationProp>();
    const route = useRoute<EventFormScreenRouteProp>();
    const { barId } = useVenue();

    const isEditMode = route.name === 'EditEvent';
    const initialEvent = isEditMode ? route.params?.event : undefined;

    // State for form fields
    const [themeName, setThemeName] = useState(initialEvent?.theme_name || '');
    const [description, setDescription] = useState(initialEvent?.description || '');
    // Read as a local day: `new Date('2031-06-21')` is UTC midnight, and the payload uses the
    // local parts (toLocalIsoDate), so editing would save the previous day west of UTC.
    const [eventDate, setEventDate] = useState(initialEvent?.event_date ? fromLocalIsoDate(initialEvent.event_date) : new Date());
    const [startTime, setStartTime] = useState(initialEvent?.start_time ? parseTimeString(initialEvent.start_time) : new Date());
    const [endTime, setEndTime] = useState(initialEvent?.end_time ? parseTimeString(initialEvent.end_time) : new Date());
    const [hasStartTime, setHasStartTime] = useState(!!initialEvent?.start_time);
    const [hasEndTime, setHasEndTime] = useState(!!initialEvent?.end_time);
    const [isRecurring, setIsRecurring] = useState(initialEvent?.recurring || false);
    const [recurrencePattern, setRecurrencePattern] = useState(initialEvent?.recurrence_pattern || 'weekly');
    const [specialGenres, setSpecialGenres] = useState<string[]>(initialEvent?.special_genres || []);

    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<EventFormErrors>({});

    const values = {
        themeName,
        description,
        eventDate,
        startTime,
        endTime,
        hasStartTime,
        hasEndTime,
        isRecurring,
        recurrencePattern,
        specialGenres,
    };

    // Handle form submission
    const handleSubmit = async () => {
        const found = validateEventForm(values);
        setErrors(found);
        if (Object.keys(found).length > 0) {
            return;
        }

        setSubmitting(true);

        if (!barId) {
            Alert.alert('Error', 'Bar ID not found. Please log in again.');
            setSubmitting(false);
            return;
        }

        const eventData = toEventPayload(values, barId);

        try {
            let response;

            if (isEditMode && initialEvent?.id) {
                // Update existing event
                response = await axiosClient.put(`/api/mobile/bars/${barId}/events/${initialEvent.id}`, eventData);
            } else {
                // Create new event
                response = await axiosClient.post(`/api/mobile/bars/${barId}/events`, eventData);
            }

            // Check for validation errors
            if (response.data.validationErrors) {
                const errorMessage = response.data.validationErrors.join('\n');
                Alert.alert('Validation Error', errorMessage);
                setSubmitting(false);
                return;
            }

            // Check for successful response
            if (response.data.event || response.data.message) {
                Alert.alert(
                    'Success',
                    isEditMode ? 'Event updated successfully' : 'Event created successfully',
                    [
                        {
                            text: 'OK',
                            onPress: () => navigation.goBack()
                        }
                    ]
                );
            } else {
                Alert.alert('Error', response.data.error || 'Failed to save event');
            }
        } catch (error) {
            console.error('Error saving event:', error);
            Alert.alert('Error', 'Failed to save event. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
            <ScrollView style={styles.formContainer}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>
                        {isEditMode ? 'Edit Event' : 'Create New Event'}
                    </Text>
                </View>

                <KeyboardAvoidingView
                    style={styles.form}
                    behavior={Platform.OS === 'ios' ? 'position' : undefined}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 30 : 0}
                >
                    {/* Event Theme/Name */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Event Theme/Name *</Text>
                        <TextInput
                            style={[styles.input, errors.themeName ? styles.inputError : null]}
                            value={themeName}
                            onChangeText={setThemeName}
                            placeholder="e.g., Jazz Night, Salsa Tuesday"
                            placeholderTextColor="#888"
                        />
                        {errors.themeName ? (
                            <Text style={styles.errorText}>{errors.themeName}</Text>
                        ) : null}
                    </View>

                    <EventWhenSection
                        eventDate={eventDate}
                        onEventDateChange={setEventDate}
                        startTime={startTime}
                        onStartTimeChange={setStartTime}
                        hasStartTime={hasStartTime}
                        onHasStartTimeChange={setHasStartTime}
                        endTime={endTime}
                        onEndTimeChange={setEndTime}
                        hasEndTime={hasEndTime}
                        onHasEndTimeChange={setHasEndTime}
                        endTimeError={errors.endTime}
                    />

                    {/* Description */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Description</Text>
                        <TextInput
                            style={styles.textArea}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="Describe your event, special offers, performers, etc."
                            placeholderTextColor="#888"
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                        />
                    </View>

                    <EventRecurrenceSection
                        isRecurring={isRecurring}
                        onIsRecurringChange={setIsRecurring}
                        pattern={recurrencePattern}
                        onPatternChange={setRecurrencePattern}
                    />

                    {/* Genres: the shared vocabulary the venue's own genres use; any text is accepted */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Music Genres for this Event</Text>
                        <GenreChipsInput
                            genres={specialGenres}
                            onAdd={(genre) => {
                                setSpecialGenres((current) => [...current, genre]);
                                return true;
                            }}
                            onRemove={(genre) => setSpecialGenres((current) => current.filter((g) => g !== genre))}
                            emptyText="Pick the genres of this night. People are matched against them on the event's date."
                            testIDPrefix="event-genre"
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
                                <Text style={styles.submitButtonText}>
                                    {isEditMode ? 'Update Event' : 'Create Event'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    formContainer: {
        flex: 1,
    },
    header: {
        backgroundColor: colors.primary,
        padding: 20,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: colors.text,
    },
    form: {
        padding: 20,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        color: colors.text,
        fontSize: 16,
        marginBottom: 8,
        fontWeight: '500',
    },
    input: {
        backgroundColor: colors.card,
        color: colors.text,
        padding: 12,
        borderRadius: 6,
        fontSize: 16,
    },
    inputError: {
        borderWidth: 1,
        borderColor: colors.danger,
    },
    errorText: {
        color: colors.danger,
        fontSize: 14,
        marginTop: 5,
    },
    textArea: {
        backgroundColor: colors.card,
        color: colors.text,
        padding: 12,
        borderRadius: 6,
        fontSize: 16,
        minHeight: 100,
    },
    buttonGroup: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
    },
    cancelButton: {
        backgroundColor: colors.grey700,
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 6,
        flex: 1,
        marginRight: 10,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: colors.text,
        fontSize: 16,
        fontWeight: '500',
    },
    submitButton: {
        backgroundColor: colors.primary,
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 6,
        flex: 1,
        marginLeft: 10,
        alignItems: 'center',
    },
    submitButtonText: {
        color: colors.text,
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default EventFormScreen;
