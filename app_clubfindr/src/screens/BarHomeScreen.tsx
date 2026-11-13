import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Alert,
    ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosClient from '../api/axiosClient';
import { Ionicons } from '@expo/vector-icons';
import BarStatsDashboard from '../components/BarStatsDashboard';
import { fromLocalIsoDate } from '../utils/localDate';

// Types for bar events
interface BarEvent {
    id: string;
    theme_name: string;
    description?: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    recurring?: boolean;
    recurrence_pattern?: string | null;
    special_genres: string[];
}

// Simplified navigation type
type BarHomeScreenNavigationProp = StackNavigationProp<any>;

const BarHomeScreen = () => {
    const navigation = useNavigation<BarHomeScreenNavigationProp>();
    const { user, logout } = useAuth();

    // State
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [barName, setBarName] = useState<string>('');
    const [barData, setBarData] = useState<any>(null);
    const [events, setEvents] = useState<BarEvent[]>([]);
    const [topGenres, setTopGenres] = useState<{ genre: string, count: number }[]>([]);

    // Stats state
    const [visitorsToday, setVisitorsToday] = useState(0);
    const [visitorsWeek, setVisitorsWeek] = useState(0);
    const [visitorsChange, setVisitorsChange] = useState(0);
    const [matchedUsers, setMatchedUsers] = useState(0);

    // Load bar details on component mount
    useEffect(() => {
        loadBarDetails();
        loadBarEvents();
        loadBarStats();
    }, []);

    const loadBarDetails = async () => {
        try {
            // Load bar name from AsyncStorage
            const storedBarName = await AsyncStorage.getItem('barName');
            if (storedBarName) {
                setBarName(storedBarName);
            }

            // Get bar ID from storage
            const barId = await AsyncStorage.getItem('barId');
            if (!barId) {
                console.error('Bar ID not found');
                return;
            }

            // Fetch bar details
            const barResponse = await axiosClient.get(`/api/mobile/bars/${barId}`);
            if (barResponse.data.success && barResponse.data.bar) {
                setBarData(barResponse.data.bar);
            }

            // Fetch top genres
            const genresResponse = await axiosClient.get('/api/mobile/bars/genres');
            if (genresResponse.data.success && genresResponse.data.bars) {
                // Find the current bar's genres from the list
                const currentBarGenres = genresResponse.data.bars.find((b: any) => b.barId === barId);

                if (currentBarGenres && currentBarGenres.genres) {
                    const barGenres = currentBarGenres.genres.map((g: any) => ({
                        genre: g.genre,
                        count: Math.round(g.percentage * 100) // Convert percentage to a 0-100 scale
                    }));
                    setTopGenres(barGenres);
                } else {
                    // No genres found for this specific bar
                    setTopGenres([]);
                }
            }
        } catch (error) {
            console.error('Failed to load bar details:', error);
            Alert.alert('Error', 'Failed to load bar information. Please try again.');
        }
    };

    const loadBarEvents = async () => {
        try {
            // Get bar ID from storage
            const barId = await AsyncStorage.getItem('barId');
            if (!barId) {
                console.error('Bar ID not found');
                return;
            }

            console.log('Loading events for bar:', barId);

            // Get events from the events endpoint
            const eventsResponse = await axiosClient.get(`/api/mobile/bars/${barId}/events`);
            console.log('Events response:', eventsResponse.data);

            // Get events data from response and ensure it's an array
            const eventsArray = eventsResponse.data?.events && Array.isArray(eventsResponse.data.events)
                ? eventsResponse.data.events
                : [];

            console.log('Processing events array:', eventsArray);

            // Format the events consistently with discoveryService
            const formattedEvents = eventsArray.map((event: any) => ({
                id: event.id || `event-${Math.random()}`,
                theme_name: event.theme_name || 'Event',
                description: event.description || '',
                event_date: event.event_date || new Date().toISOString().split('T')[0],
                start_time: event.start_time || null,
                end_time: event.end_time || null,
                recurring: !!event.recurring,
                recurrence_pattern: event.recurrence_pattern || null,
                special_genres: event.special_genres || []
            }));

            console.log('Setting formatted events:', formattedEvents);
            setEvents(formattedEvents);
        } catch (error) {
            console.error('Error loading events:', error);
            setEvents([]);
        }
    };

    const loadBarStats = async () => {
        try {
            const statsResponse = await axiosClient.get('/api/mobile/bars/stats');
            if (statsResponse.data.success) {
                const stats = statsResponse.data.stats;
                setVisitorsToday(stats.visitorsToday || 0);
                setVisitorsWeek(stats.visitorsWeek || 0);
                setVisitorsChange(stats.weekOverWeekChange || 0);
                setMatchedUsers(stats.matchedUsers || 0);
            }
        } catch (error) {
            console.error('Error loading bar stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);

        try {
            await Promise.all([
                loadBarDetails(),
                loadBarEvents(),
                loadBarStats()
            ]);
        } catch (error) {
            console.error('Error refreshing data:', error);
        } finally {
            setRefreshing(false);
        }
    }, []);

    const handleAddEvent = () => {
        navigation.navigate('AddEvent');
    };

    const handleEditEvent = (event: BarEvent) => {
        navigation.navigate('EditEvent', { event });
    };

    // Temporarily remove delete functionality until proper endpoint is available
    const handleDeleteEvent = (eventId: string) => {
        Alert.alert(
            'Feature Not Available',
            'Event deletion is currently not available. Please contact support for assistance.',
            [{ text: 'OK' }]
        );
    };

    // Format date for display
    const formatDate = (dateString: string): string => {
        const options: Intl.DateTimeFormatOptions = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        // A YYYY-MM-DD calendar date read as a local day, not UTC midnight
        return fromLocalIsoDate(dateString).toLocaleDateString('en-US', options);
    };

    // Format time for display
    const formatTime = (timeString: string | null): string => {
        if (!timeString) return '';
        return timeString.substring(0, 5); // Format as HH:MM
    };

    // Handle edit profile
    const handleEditProfile = () => {
        navigation.navigate('EditBarProfile');
    };

    // Logout handler
    const handleLogout = () => {
        Alert.alert(
            'Log Out',
            'Are you sure you want to log out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Log Out',
                    style: 'destructive',
                    onPress: async () => {
                        await logout();
                        // Additional cleanup specific to bar manager
                        await AsyncStorage.removeItem('barName');
                        await AsyncStorage.removeItem('barId');
                    }
                }
            ]
        );
    };

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                }
            >
                <View style={styles.header}>
                    <Text style={styles.barName}>{barName || 'My Bar'}</Text>
                    <Text style={styles.subtitle}>Manager Dashboard</Text>

                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={styles.qrButton}
                            onPress={() => navigation.navigate('QRCodeGenerator')}
                        >
                            <Ionicons name="qr-code-outline" size={18} color="#FFFFFF" />
                            <Text style={styles.buttonText}>QR Codes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.qrButton}
                            onPress={() => navigation.navigate('VenueArtists')}
                            testID="open-venue-artists"
                        >
                            <Ionicons name="musical-notes-outline" size={18} color="#FFFFFF" />
                            <Text style={styles.buttonText}>Artists</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
                            <Ionicons name="settings-outline" size={18} color="#FFFFFF" />
                            <Text style={styles.buttonText}>Edit Profile</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                            <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
                            <Text style={styles.buttonText}>Log Out</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Stats Dashboard Section */}
                <BarStatsDashboard
                    loading={loading}
                    topGenres={topGenres}
                    visitorsToday={visitorsToday}
                    visitorsWeek={visitorsWeek}
                    compareToLastWeek={visitorsChange}
                    matchedUsers={matchedUsers}
                    onRefresh={handleRefresh}
                />

                {!loading && (
                    <>
                        {/* Events Section */}
                        <View style={styles.eventsSection}>
                            <View style={styles.eventsSectionHeader}>
                                <Text style={styles.sectionTitle}>Special Events & Themes</Text>
                                <TouchableOpacity style={styles.addEventButton} onPress={handleAddEvent}>
                                    <Ionicons name="add" size={20} color="#FFFFFF" />
                                    <Text style={styles.addEventButtonText}>Add Event</Text>
                                </TouchableOpacity>
                            </View>

                            {events.length > 0 ? (
                                events.map((event) => (
                                    <View key={event.id} style={styles.eventCard}>
                                        <View style={styles.eventHeader}>
                                            <Text style={styles.eventName}>{event.theme_name}</Text>
                                            <View style={styles.eventActions}>
                                                <TouchableOpacity
                                                    style={styles.eventAction}
                                                    onPress={() => handleEditEvent(event)}
                                                >
                                                    <Ionicons name="create-outline" size={18} color="#2196f3" />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.eventAction}
                                                    onPress={() => handleDeleteEvent(event.id)}
                                                >
                                                    <Ionicons name="trash-outline" size={18} color="#f44336" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>

                                        <View style={styles.eventDate}>
                                            <Text style={styles.eventDateText}>{formatDate(event.event_date)}</Text>
                                            {event.recurring && (
                                                <View style={styles.recurringBadge}>
                                                    <Text style={styles.recurringBadgeText}>
                                                        Recurring ({event.recurrence_pattern})
                                                    </Text>
                                                </View>
                                            )}
                                        </View>

                                        {(event.start_time || event.end_time) && (
                                            <Text style={styles.eventTime}>
                                                {event.start_time && event.end_time
                                                    ? `${formatTime(event.start_time)} - ${formatTime(event.end_time)}`
                                                    : event.start_time
                                                        ? `Starts at ${formatTime(event.start_time)}`
                                                        : `Ends at ${formatTime(event.end_time)}`}
                                            </Text>
                                        )}

                                        {event.description && (
                                            <Text style={styles.eventDescription}>{event.description}</Text>
                                        )}

                                        {event.special_genres && event.special_genres.length > 0 && (
                                            <View style={styles.eventGenres}>
                                                {event.special_genres.map((genre, index) => (
                                                    <View key={index} style={styles.eventGenreTag}>
                                                        <Text style={styles.eventGenreText}>{genre}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                ))
                            ) : (
                                <View style={styles.emptyState}>
                                    <Text style={styles.emptyStateHeader}>No Events Created Yet</Text>
                                    <Text style={styles.emptyStateText}>
                                        Create special themed nights, recurring events, or one-time occasions to attract customers.
                                    </Text>
                                    <TouchableOpacity style={styles.createFirstEventButton} onPress={handleAddEvent}>
                                        <Text style={styles.createFirstEventButtonText}>Create Your First Event</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    qrButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 20,
        marginHorizontal: 5,
    },
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
    barName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 5,
    },
    subtitle: {
        fontSize: 16,
        color: '#FFFFFF',
        opacity: 0.8,
        marginBottom: 15,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        width: '100%',
    },
    resetButton: {
        backgroundColor: '#333333',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 4,
    },
    resetButtonText: {
        color: '#FF5252',
        fontSize: 12,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 20,
        marginHorizontal: 5,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 20,
        marginHorizontal: 5,
    },
    buttonText: {
        color: '#FFFFFF',
        marginLeft: 5,
        fontSize: 14,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 15,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    eventsSection: {
        padding: 20,
        backgroundColor: '#1E1E1E',
        marginBottom: 10,
    },
    eventsSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 5,
    },
    addEventButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1db954',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
    },
    addEventButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        marginLeft: 5,
    },
    eventCard: {
        backgroundColor: '#2A2A2A',
        borderRadius: 8,
        padding: 15,
        marginBottom: 15,
    },
    eventHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    eventName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        flex: 1,
    },
    eventActions: {
        flexDirection: 'row',
    },
    eventAction: {
        padding: 5,
        marginLeft: 10,
    },
    eventDate: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    eventDateText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '500',
    },
    recurringBadge: {
        backgroundColor: '#2196f3',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        marginLeft: 10,
    },
    recurringBadgeText: {
        color: '#FFFFFF',
        fontSize: 12,
    },
    eventTime: {
        color: '#BBBBBB',
        fontSize: 14,
        marginBottom: 10,
    },
    eventDescription: {
        color: '#CCCCCC',
        fontSize: 14,
        marginBottom: 15,
        lineHeight: 20,
    },
    eventGenres: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    eventGenreTag: {
        backgroundColor: 'rgba(29, 185, 84, 0.8)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        marginRight: 8,
        marginBottom: 8,
    },
    eventGenreText: {
        color: '#FFFFFF',
        fontSize: 12,
    },
    emptyState: {
        padding: 30,
        alignItems: 'center',
        backgroundColor: '#2A2A2A',
        borderRadius: 8,
    },
    emptyStateHeader: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 10,
    },
    emptyStateText: {
        color: '#CCCCCC',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 20,
    },
    createFirstEventButton: {
        backgroundColor: '#1db954',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 25,
    },
    createFirstEventButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default BarHomeScreen;
