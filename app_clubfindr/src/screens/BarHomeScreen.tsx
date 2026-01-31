import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Alert,
    Image,
    ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosClient from '../api/axiosClient';
import { Ionicons } from '@expo/vector-icons';
import BarStatsDashboard from '../components/BarStatsDashboard';
import * as mobileSpotifyService from '../services/mobileSpotifyService';
import BarSpotifyConnect from '../components/BarSpotifyConnect';

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

interface CurrentlyPlaying {
    name: string;
    artists: { name: string }[];
    album: {
        images: { url: string }[];
    };
}

// Simplified navigation type
type BarHomeScreenNavigationProp = StackNavigationProp<any>;

const BarHomeScreen = () => {
    const navigation = useNavigation<BarHomeScreenNavigationProp>();
    const { user, logout, isSpotifyConnected, spotifyAuth } = useAuth();

    // State
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [barName, setBarName] = useState<string>('');
    const [barData, setBarData] = useState<any>(null);
    const [currentlyPlaying, setCurrentlyPlaying] = useState<CurrentlyPlaying | null>(null);
    const [events, setEvents] = useState<BarEvent[]>([]);
    const [topGenres, setTopGenres] = useState<{ genre: string, count: number }[]>([]);
    const [recentlyPlayed, setRecentlyPlayed] = useState<any[]>([]);
    const [spotifyConnecting, setSpotifyConnecting] = useState(false);
    const [needsSpotifyConnection, setNeedsSpotifyConnection] = useState(false);

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

    // Check for Spotify connection when bar data is loaded
    useEffect(() => {
        if (barData) {
            checkSpotifyConnection();
        }
    }, [barData]);

    // Check for currently playing track periodically when Spotify is connected
    useEffect(() => {
        if (isSpotifyConnected) {
            // Initial fetch
            fetchCurrentlyPlaying();

            // Set up periodic refresh for currently playing and token validation
            const interval = setInterval(async () => {
                // First ensure we have a valid token
                const isValid = await mobileSpotifyService.validateSpotifyConnection();
                if (!isValid) {
                    // Try to refresh the token
                    const result = await mobileSpotifyService.refreshAccessToken();
                    if (!result.success) {
                        console.log('Failed to refresh Spotify token');
                        return;
                    }
                }

                // Then fetch currently playing
                fetchCurrentlyPlaying();
            }, 90000); // Every 90 seconds

            return () => clearInterval(interval);
        }
    }, [isSpotifyConnected]);

    const checkSpotifyConnection = async () => {
        try {
            // Check if the bar uses Spotify as its music service
            if (barData?.music_service === 'spotify') {
                setNeedsSpotifyConnection(true);

                // Check if the connection is still valid
                if (isSpotifyConnected) {
                    const isValid = await mobileSpotifyService.validateSpotifyConnection();
                    if (!isValid) {
                        // Try to refresh the token
                        const result = await mobileSpotifyService.refreshAccessToken();
                        if (!result.success && result.shouldDisconnect) {
                            // Clear the connection state
                            await AsyncStorage.setItem('spotifyConnected', 'false');
                            Alert.alert(
                                'Spotify Connection Issue',
                                'Your Spotify connection has expired. Please reconnect to continue displaying your music.'
                            );
                        }
                    }
                }
            } else {
                setNeedsSpotifyConnection(false);
            }
        } catch (error) {
            console.error('Error checking Spotify connection:', error);
            // On error, assume we need to reconnect
            setNeedsSpotifyConnection(true);
        }
    };

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

            // Fetch recently played tracks if Spotify is connected
            if (isSpotifyConnected) {
                fetchRecentlyPlayed();
            }
        } catch (error) {
            console.error('Failed to load bar details:', error);
            Alert.alert('Error', 'Failed to load bar information. Please try again.');
        }
    };

    const fetchCurrentlyPlaying = async () => {
        try {
            if (!isSpotifyConnected) {
                setCurrentlyPlaying(null);
                return;
            }

            // Get a valid access token
            let accessToken = await mobileSpotifyService.getValidAccessToken();
            if (!accessToken) {
                console.log('No valid access token for fetching currently playing track');
                // Try to refresh the token
                const result = await mobileSpotifyService.refreshAccessToken();
                if (!result.success) {
                    setCurrentlyPlaying(null);
                    return;
                }
                // Get the new token after refresh
                accessToken = await mobileSpotifyService.getValidAccessToken();
                if (!accessToken) {
                    setCurrentlyPlaying(null);
                    return;
                }
            }

            // Fetch currently playing
            const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            if (response.status === 204) {
                // No track is currently playing
                setCurrentlyPlaying(null);
                return;
            }

            if (!response.ok) {
                console.error('Failed to fetch currently playing track:', response.status);
                return;
            }

            const data = await response.json();

            if (data && data.item) {
                const newTrack = {
                    name: data.item.name,
                    artists: data.item.artists.map((artist: any) => ({ name: artist.name })),
                    album: {
                        images: data.item.album.images
                    }
                };

                // Only update if the track has changed
                if (!currentlyPlaying ||
                    currentlyPlaying.name !== newTrack.name ||
                    currentlyPlaying.artists[0]?.name !== newTrack.artists[0]?.name) {
                    setCurrentlyPlaying(newTrack);
                }
            }
        } catch (error) {
            console.error('Error fetching currently playing track:', error);
        }
    };

    const fetchRecentlyPlayed = async () => {
        try {
            // Get a valid access token
            const accessToken = await mobileSpotifyService.getValidAccessToken();
            if (!accessToken) {
                console.log('No valid access token for fetching recently played tracks');
                return;
            }

            const response = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=5', {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                console.error('Failed to fetch recently played tracks:', response.status);
                return;
            }

            const data = await response.json();

            if (data && data.items) {
                const tracks = data.items.map((item: any) => ({
                    id: item.track.id,
                    name: item.track.name,
                    artist: item.track.artists.map((artist: any) => artist.name).join(', '),
                    albumImage: item.track.album.images[0]?.url || null,
                    playedAt: item.played_at
                }));

                setRecentlyPlayed(tracks);
            }
        } catch (error) {
            console.error('Error fetching recently played tracks:', error);
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

    const resetSpotifyConnection = async () => {
        try {
            // Clear all Spotify-related storage
            await AsyncStorage.removeItem('spotify_access_token');
            await AsyncStorage.removeItem('spotify_refresh_token');
            await AsyncStorage.removeItem('spotify_expiration');
            await AsyncStorage.removeItem('spotifyConnected');

            // Force update UI state
            await AsyncStorage.setItem('spotifyConnected', 'false');

            // Refresh the page
            handleRefresh();

            Alert.alert(
                "Spotify Connection Reset",
                "Spotify connection has been reset. Please connect your account again."
            );
        } catch (error) {
            console.error('Error resetting Spotify connection:', error);
            Alert.alert('Error', 'Failed to reset Spotify connection. Please try again.');
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
                loadBarStats(),
                isSpotifyConnected ? fetchCurrentlyPlaying() : Promise.resolve()
            ]);
        } catch (error) {
            console.error('Error refreshing data:', error);
        } finally {
            setRefreshing(false);
        }
    }, [isSpotifyConnected]);

    const handleSpotifyAuth = async () => {
        try {
            setSpotifyConnecting(true);
            await spotifyAuth();
            // Fetch current track after connection
            await fetchCurrentlyPlaying();
            Alert.alert('Success', 'Spotify connected successfully! Now displaying your currently playing music.');
        } catch (error) {
            console.error('Failed to connect to Spotify:', error);
            Alert.alert('Connection Failed', 'Could not connect to Spotify. Please try again.');
        } finally {
            setSpotifyConnecting(false);
        }
    };

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
        return new Date(dateString).toLocaleDateString('en-US', options);
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
                        {/* Spotify Connection Section */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>
                                {isSpotifyConnected ? 'Spotify Connected' : 'Connect Spotify'}
                            </Text>

                            <BarSpotifyConnect
                                barMusicService={barData?.music_service}
                                onConnection={fetchCurrentlyPlaying}
                            />
                        </View>



                        {/* Currently Playing Section */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Currently Playing</Text>
                            {isSpotifyConnected ? (
                                currentlyPlaying ? (
                                    <View style={styles.currentlyPlayingContainer}>
                                        {currentlyPlaying.album.images[0]?.url && (
                                            <Image
                                                source={{ uri: currentlyPlaying.album.images[0]?.url }}
                                                style={styles.albumCover}
                                            />
                                        )}
                                        <View style={styles.trackInfo}>
                                            <Text style={styles.trackName}>{currentlyPlaying.name}</Text>
                                            <Text style={styles.artistName}>
                                                {currentlyPlaying.artists.map(a => a.name).join(', ')}
                                            </Text>
                                        </View>
                                    </View>
                                ) : (
                                    <Text style={styles.emptyStateText}>No track currently playing</Text>
                                )
                            ) : needsSpotifyConnection ? (
                                <Text style={styles.emptyStateText}>
                                    Connect to Spotify to display your currently playing track
                                </Text>
                            ) : (
                                <Text style={styles.emptyStateText}>
                                    To display your current music, update your profile to use Spotify as your music service
                                </Text>
                            )}
                        </View>

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
    section: {
        padding: 20,
        backgroundColor: '#1E1E1E',
        marginBottom: 10,
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
    currentlyPlayingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    albumCover: {
        width: 80,
        height: 80,
        borderRadius: 6,
        marginRight: 15,
    },
    trackInfo: {
        flex: 1,
    },
    trackName: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    artistName: {
        color: '#CCCCCC',
        fontSize: 14,
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
    spotifyConnectContainer: {
        padding: 15,
        backgroundColor: '#2A2A2A',
        borderRadius: 8,
        alignItems: 'center',
    },
    spotifyConnectText: {
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 15,
    },
    spotifyConnectedContainer: {
        flexDirection: 'row',
        padding: 15,
        backgroundColor: 'rgba(29, 185, 84, 0.1)',
        borderRadius: 8,
        alignItems: 'center',
    },
    spotifyConnectedText: {
        color: '#FFFFFF',
        marginLeft: 10,
        flex: 1,
    },
});

export default BarHomeScreen;
