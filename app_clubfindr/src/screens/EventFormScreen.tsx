import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Platform,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Switch,
    ScrollView
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { DatePickerModal, TimePickerModal } from 'react-native-paper-dates';
import { enGB, registerTranslation } from 'react-native-paper-dates';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import axiosClient from '../api/axiosClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
type EventFormScreenNavigationProp = StackNavigationProp<any>;

// Register the English locale
registerTranslation('en', enGB);

const EventFormScreen = () => {
    const navigation = useNavigation<EventFormScreenNavigationProp>();
    const route = useRoute<EventFormScreenRouteProp>();

    const isEditMode = route.name === 'EditEvent';
    const initialEvent = isEditMode ? route.params?.event : undefined;

    // State for form fields
    const [themeName, setThemeName] = useState(initialEvent?.theme_name || '');
    const [description, setDescription] = useState(initialEvent?.description || '');
    const [eventDate, setEventDate] = useState(initialEvent?.event_date ? new Date(initialEvent.event_date) : new Date());
    const [startTime, setStartTime] = useState(initialEvent?.start_time ? parseTimeString(initialEvent.start_time) : new Date());
    const [endTime, setEndTime] = useState(initialEvent?.end_time ? parseTimeString(initialEvent.end_time) : new Date());
    const [hasStartTime, setHasStartTime] = useState(!!initialEvent?.start_time);
    const [hasEndTime, setHasEndTime] = useState(!!initialEvent?.end_time);
    const [isRecurring, setIsRecurring] = useState(initialEvent?.recurring || false);
    const [recurrencePattern, setRecurrencePattern] = useState(initialEvent?.recurrence_pattern || 'weekly');
    const [specialGenres, setSpecialGenres] = useState<string[]>(initialEvent?.special_genres || []);
    const [isStartTimePickerVisible, setStartTimePickerVisible] = useState(false);
    const [isEndTimePickerVisible, setEndTimePickerVisible] = useState(false);

    // UI state
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [customGenre, setCustomGenre] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Predefined genre options
    const genreOptions = [
        'House', 'Techno', 'Hip-Hop', 'R&B', 'Jazz', 'Rock', 'Live Music',
        'Indie', 'Reggae', 'Latin', 'Blues', 'Acoustic', 'Pop', 'EDM',
        'Country', 'Folk', 'Soul', 'Funk'
    ];

    // Parse time string (HH:MM) to Date object
    function parseTimeString(timeString: string): Date {
        const [hours, minutes] = timeString.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return date;
    }

    // Format Date to YYYY-MM-DD
    function formatDateToString(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Format time from Date object to HH:MM
    function formatTimeToString(date: Date): string {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    // Display formatted date
    function getFormattedDate(): string {
        return eventDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Display formatted time
    function getFormattedTime(date: Date): string {
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    // Toggle genre selection
    const toggleGenre = (genre: string) => {
        if (specialGenres.includes(genre)) {
            setSpecialGenres(specialGenres.filter(g => g !== genre));
        } else {
            setSpecialGenres([...specialGenres, genre]);
        }
    };

    // Add custom genre
    const addCustomGenre = () => {
        if (customGenre.trim() && !specialGenres.includes(customGenre.trim())) {
            setSpecialGenres([...specialGenres, customGenre.trim()]);
            setCustomGenre('');
        }
    };



    // Form validation
    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!themeName.trim()) {
            newErrors.themeName = 'Event theme/name is required';
        }

        if (hasEndTime && hasStartTime) {
            const startHour = startTime.getHours();
            const endHour = endTime.getHours();

            // If end time is between midnight and 6 AM, assume it's for the next day
            if (endHour >= 0 && endHour < 6) {
                // This is valid - early morning hours are considered next day
            } else if (endTime <= startTime) {
                newErrors.endTime = 'End time must be after start time';
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
        const barId = await AsyncStorage.getItem('barId');

        if (!barId) {
            Alert.alert('Error', 'Bar ID not found. Please log in again.');
            setSubmitting(false);
            return;
        }

        // Prepare event data
        const eventData = {
            bar_id: barId,
            theme_name: themeName,
            description: description || '',
            event_date: formatDateToString(eventDate),
            start_time: hasStartTime ? formatTimeToString(startTime) : null,
            end_time: hasEndTime ? formatTimeToString(endTime) : null,
            recurring: isRecurring || false,
            recurrence_pattern: isRecurring ? recurrencePattern : null,
            special_genres: specialGenres || []
        };

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

    // Render genre item for the FlatList
    const renderGenreItem = ({ item }: { item: string }) => (
        <TouchableOpacity
            style={[
                styles.genreTag,
                specialGenres.includes(item) && styles.genreTagSelected
            ]}
            onPress={() => toggleGenre(item)}
        >
            <Text
                style={[
                    styles.genreText,
                    specialGenres.includes(item) && styles.genreTextSelected
                ]}
            >
                {item}
            </Text>
        </TouchableOpacity>
    );

    // Render selected genre item
    const renderSelectedGenreItem = ({ item }: { item: string }) => (
        <View key={item} style={styles.selectedGenreTag}>
            <Text style={styles.selectedGenreText}>{item}</Text>
            <TouchableOpacity onPress={() => toggleGenre(item)}>
                <Ionicons name="close-circle" size={18} color="#FFFFFF" />
            </TouchableOpacity>
        </View>
    );

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

                    {/* Event Date */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Event Date *</Text>
                        <TouchableOpacity
                            style={styles.dateInput}
                            onPress={() => setShowDatePicker(true)}
                        >
                            <Text style={styles.dateText}>{getFormattedDate()}</Text>
                            <Ionicons name="calendar-outline" size={20} color="#CCCCCC" />
                        </TouchableOpacity>
                        <DatePickerModal
                            visible={showDatePicker}
                            mode="single"
                            date={eventDate}
                            locale="en"
                            onDismiss={() => setShowDatePicker(false)}
                            onConfirm={({ date }) => {
                                setShowDatePicker(false);
                                if (date) {
                                    setEventDate(date);
                                }
                            }}
                        />

                    </View>

                    {/* Time Selectors */}
                    <View style={styles.timeContainer}>
                        {/* Start Time */}
                        <View style={styles.timeGroup}>
                            <View style={styles.timeHeader}>
                                <Text style={styles.label}>Start Time</Text>
                                <Switch
                                    value={hasStartTime}
                                    onValueChange={setHasStartTime}
                                    trackColor={{ false: '#444', true: '#D35400' }}
                                    thumbColor={hasStartTime ? '#fff' : '#f4f3f4'}
                                />
                            </View>
                            {hasStartTime && (
                                <TouchableOpacity
                                    style={styles.timeInput}
                                    onPress={() => setShowStartTimePicker(true)}
                                    disabled={!hasStartTime}
                                >
                                    <Text style={styles.timeText}>{getFormattedTime(startTime)}</Text>
                                    <Ionicons name="time-outline" size={20} color="#CCCCCC" />
                                </TouchableOpacity>
                            )}
                            <TimePickerModal
                                visible={showStartTimePicker && hasStartTime}
                                onDismiss={() => setShowStartTimePicker(false)}
                                onConfirm={({ hours, minutes }) => {
                                    const newTime = new Date(startTime);
                                    newTime.setHours(hours);
                                    newTime.setMinutes(minutes);
                                    setStartTime(newTime);
                                    setShowStartTimePicker(false);
                                }}
                                locale="en"
                            />


                        </View>

                        {/* End Time */}
                        <View style={styles.timeGroup}>
                            <View style={styles.timeHeader}>
                                <Text style={styles.label}>End Time</Text>
                                <Switch
                                    value={hasEndTime}
                                    onValueChange={setHasEndTime}
                                    trackColor={{ false: '#444', true: '#D35400' }}
                                    thumbColor={hasEndTime ? '#fff' : '#f4f3f4'}
                                />
                            </View>
                            {hasEndTime && (
                                <TouchableOpacity
                                    style={styles.timeInput}
                                    onPress={() => setShowEndTimePicker(true)}
                                    disabled={!hasEndTime}
                                >
                                    <Text style={styles.timeText}>{getFormattedTime(endTime)}</Text>
                                    <Ionicons name="time-outline" size={20} color="#CCCCCC" />
                                </TouchableOpacity>
                            )}
                            <TimePickerModal
                                visible={showEndTimePicker && hasEndTime}
                                onDismiss={() => setShowEndTimePicker(false)}
                                onConfirm={({ hours, minutes }) => {
                                    const newTime = new Date(endTime);
                                    newTime.setHours(hours);
                                    newTime.setMinutes(minutes);
                                    setEndTime(newTime);
                                    setShowEndTimePicker(false);
                                }}
                                locale="en"
                            />

                        </View>
                    </View>

                    {errors.endTime ? (
                        <Text style={styles.errorText}>{errors.endTime}</Text>
                    ) : null}

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

                    {/* Recurring Event */}
                    <View style={styles.formGroup}>
                        <View style={styles.switchContainer}>
                            <Text style={styles.label}>Recurring Event</Text>
                            <Switch
                                value={isRecurring}
                                onValueChange={setIsRecurring}
                                trackColor={{ false: '#444', true: '#D35400' }}
                                thumbColor={isRecurring ? '#fff' : '#f4f3f4'}
                            />
                        </View>
                    </View>

                    {/* Recurrence Pattern - visible only if recurring is true */}
                    {isRecurring && (
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Recurrence Pattern</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={recurrencePattern}
                                    onValueChange={(itemValue) => setRecurrencePattern(itemValue)}
                                    style={styles.picker}
                                    dropdownIconColor="#FFFFFF"
                                >
                                    <Picker.Item label="Daily" value="daily" color="#FFFFFF" />
                                    <Picker.Item label="Weekly" value="weekly" color="#FFFFFF" />
                                    <Picker.Item label="Bi-weekly" value="biweekly" color="#FFFFFF" />
                                    <Picker.Item label="Monthly" value="monthly" color="#FFFFFF" />
                                </Picker>
                            </View>
                        </View>
                    )}

                    {/* Genres */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Music Genres for this Event</Text>
                        <FlatList
                            data={genreOptions}
                            renderItem={renderGenreItem}
                            keyExtractor={(item) => item}
                            numColumns={3}
                            columnWrapperStyle={styles.genresGrid}
                            scrollEnabled={false}
                        />
                    </View>

                    {/* Custom Genre */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Add Custom Genre</Text>
                        <View style={styles.customGenreContainer}>
                            <TextInput
                                style={styles.customGenreInput}
                                value={customGenre}
                                onChangeText={setCustomGenre}
                                placeholder="Enter custom genre"
                                placeholderTextColor="#888"
                            />
                            <TouchableOpacity
                                style={[styles.addButton, !customGenre.trim() && styles.addButtonDisabled]}
                                onPress={addCustomGenre}
                                disabled={!customGenre.trim()}
                            >
                                <Text style={styles.addButtonText}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Selected Genres Display */}
                    {specialGenres.length > 0 && (
                        <View style={styles.selectedGenresContainer}>
                            <Text style={styles.selectedGenresTitle}>Selected Genres:</Text>
                            <FlatList
                                data={specialGenres}
                                renderItem={renderSelectedGenreItem}
                                keyExtractor={(item) => item}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                            />
                        </View>
                    )}

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
        backgroundColor: '#121212',
    },
    formContainer: {
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
    dateInput: {
        backgroundColor: '#2A2A2A',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderRadius: 6,
    },
    dateText: {
        color: '#FFFFFF',
        fontSize: 16,
    },
    timeContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    timeGroup: {
        width: '48%',
    },
    timeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    timeInput: {
        backgroundColor: '#2A2A2A',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderRadius: 6,
    },
    timeText: {
        color: '#FFFFFF',
        fontSize: 16,
    },
    textArea: {
        backgroundColor: '#2A2A2A',
        color: '#FFFFFF',
        padding: 12,
        borderRadius: 6,
        fontSize: 16,
        minHeight: 100,
    },
    switchContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    pickerContainer: {
        backgroundColor: '#2A2A2A',
        borderRadius: 6,
        overflow: 'hidden',
    },
    picker: {
        color: '#FFFFFF',
        height: 50,
    },
    genresGrid: {
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    genreTag: {
        backgroundColor: '#2A2A2A',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        margin: 4,
    },
    genreTagSelected: {
        backgroundColor: '#1db954',
    },
    genreText: {
        color: '#FFFFFF',
        fontSize: 14,
    },
    genreTextSelected: {
        fontWeight: 'bold',
    },
    customGenreContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    customGenreInput: {
        backgroundColor: '#2A2A2A',
        color: '#FFFFFF',
        padding: 12,
        borderRadius: 6,
        fontSize: 16,
        flex: 1,
        marginRight: 10,
    },
    addButton: {
        backgroundColor: '#1db954',
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderRadius: 6,
    },
    addButtonDisabled: {
        backgroundColor: '#444',
    },
    addButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    selectedGenresContainer: {
        marginBottom: 20,
    },
    selectedGenresTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 8,
    },
    selectedGenresList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    selectedGenreTag: {
        backgroundColor: '#1db954',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 20,
        margin: 4,
    },
    selectedGenreText: {
        color: '#FFFFFF',
        fontSize: 14,
        marginRight: 5,
    },
    buttonGroup: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
    },
    cancelButton: {
        backgroundColor: '#444',
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 6,
        flex: 1,
        marginRight: 10,
        alignItems: 'center',
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
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default EventFormScreen;
