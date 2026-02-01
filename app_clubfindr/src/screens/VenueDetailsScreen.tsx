import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import * as discoveryService from '../services/discoveryService';

type VenueDetailsScreenProps = {
    route: RouteProp<RootStackParamList, 'VenueDetails'>;
};

const VenueDetailsScreen = ({ route }: VenueDetailsScreenProps) => {
    const { venue: initialVenue }: { venue: discoveryService.Venue } = route.params;
    const [venue, setVenue] = useState<discoveryService.Venue>(initialVenue);
    const [userLocation, setUserLocation] = useState<{ latitude: number, longitude: number } | null>(null);
    const [distance, setDistance] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(true);
    const [events, setEvents] = useState<discoveryService.Event[]>([]);
    const isClub = venue.venueType === 'club';

    useEffect(() => {
        // Get location and calculate distance
        getUserLocation();

        // Fetch events for this venue
        fetchVenueEvents();
    }, []);

    const fetchVenueEvents = async () => {
        try {
            setLoadingEvents(true);

            // Use the discoveryService function to get venue events
            const venueEvents = await discoveryService.getVenueEvents(venue.id, venue.venueType || 'bar', venue.name);

            console.log(`Fetched ${venueEvents.length} events for ${venue.name}`);

            // Format the events for display if needed
            const formattedEvents = venueEvents.map(event => {
                // Format times as strings
                const startTime = event.start_time || null;
                const endTime = event.end_time || null;

                return {
                    ...event,
                    start_time: startTime,
                    end_time: endTime
                };
            });

            // Set events in state
            setEvents(formattedEvents);

            // Also update the venue object to include events
            setVenue(prevVenue => ({
                ...prevVenue,
                events: formattedEvents
            }));
        } catch (error) {
            console.error('Error fetching venue events:', error);
            // If we already have events in the venue object, use those
            if (venue.events && venue.events.length > 0) {
                console.log('Using events from venue object');
                setEvents(venue.events);
            }
        } finally {
            setLoadingEvents(false);
        }
    };

    const getUserLocation = async () => {
        try {
            setLoading(true);
            const location = await discoveryService.getCurrentLocation();
            if (location) {
                setUserLocation(location);

                // If venue has coordinates, calculate distance
                if (venue.latitude && venue.longitude) {
                    const calculatedDistance = discoveryService.calculateDistance(
                        location.latitude,
                        location.longitude,
                        venue.latitude,
                        venue.longitude
                    );
                    setDistance(calculatedDistance);
                } else {
                    // If venue doesn't have coordinates, try to geocode the address
                    try {
                        const coordinates = await discoveryService.geocodeAddress(venue.address);
                        if (coordinates) {
                            const calculatedDistance = discoveryService.calculateDistance(
                                location.latitude,
                                location.longitude,
                                coordinates.latitude,
                                coordinates.longitude
                            );
                            setDistance(calculatedDistance);
                        }
                    } catch (geocodeError) {
                        console.error('Error geocoding address:', geocodeError);
                    }
                }
            }
        } catch (error) {
            console.error('Error getting user location:', error);
        } finally {
            setLoading(false);
        }
    };

    const openMaps = () => {
        const url = `https://maps.google.com/?q=${encodeURIComponent(venue.address)}`;
        Linking.openURL(url);
    };

    // Format distance for display
    const formatDistance = (meters: number): string => {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km away`;
        } else {
            return `${Math.round(meters)} m away`;
        }
    };

    // Format date for display
    const formatDate = (dateString?: string): string => {
        if (!dateString) return '';

        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return ''; // Invalid date

            return date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (e) {
            console.error('Error formatting date:', e);
            return '';
        }
    };

    // Format time
    const formatTime = (startTime?: string | null, endTime?: string | null): string => {
        if (!startTime) return '';

        if (endTime) {
            return `${startTime} - ${endTime}`;
        }

        return startTime;
    };

    // Check if date is today
    const isToday = (dateString?: string): boolean => {
        if (!dateString) return false;

        try {
            const date = new Date(dateString);
            const today = new Date();

            return date.getDate() === today.getDate() &&
                date.getMonth() === today.getMonth() &&
                date.getFullYear() === today.getFullYear();
        } catch (e) {
            return false;
        }
    };

    // Check if date is this weekend (Friday, Saturday, Sunday)
    const isThisWeekend = (dateString?: string): boolean => {
        if (!dateString) return false;

        try {
            const date = new Date(dateString);
            const today = new Date();
            const day = date.getDay(); // 0 = Sunday, 6 = Saturday

            // Check if it's Friday, Saturday, or Sunday
            if (day === 5 || day === 6 || day === 0) {
                // Check if it's this week
                const diffTime = date.getTime() - today.getTime();
                const diffDays = diffTime / (1000 * 3600 * 24);
                return diffDays >= 0 && diffDays < 7;
            }

            return false;
        } catch (e) {
            return false;
        }
    };

    // Sort events by date
    const sortedEvents = [...events].sort((a, b) => {
        if (!a.event_date) return 1;
        if (!b.event_date) return -1;
        return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
    });

    // Separate events into today, this weekend, and upcoming
    const todayEvents = sortedEvents.filter(event => isToday(event.event_date));
    const weekendEvents = sortedEvents.filter(event => !isToday(event.event_date) && isThisWeekend(event.event_date));
    const upcomingEvents = sortedEvents.filter(event => !isToday(event.event_date) && !isThisWeekend(event.event_date));

    // Render event card
    const renderEventCard = (event: discoveryService.Event, index: number) => (
        <View key={event.id || index} style={styles.eventCard}>
            <Text style={styles.eventName}>{event.theme_name}</Text>
            <Text style={styles.eventDetail}>{formatDate(event.event_date)}</Text>
            {(event.start_time || event.end_time) && (
                <Text style={styles.eventDetail}>
                    Time: {formatTime(event.start_time, event.end_time)}
                </Text>
            )}
            {event.description && (
                <Text style={styles.eventDescription}>{event.description}</Text>
            )}
            {event.special_genres && event.special_genres.length > 0 && (
                <View style={styles.genreContainer}>
                    {event.special_genres.map((genre, idx) => (
                        <View key={idx} style={[styles.genreBadge, isClub ? styles.clubGenreBadge : styles.barGenreBadge]}>
                            <Text style={styles.genreText}>{genre}</Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );

    // Render events section if available
    const renderEvents = () => {
        if (loadingEvents) {
            return (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#D35400" />
                    <Text style={styles.loadingText}>Loading events...</Text>
                </View>
            );
        }

        if (!events || events.length === 0) {
            return (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Upcoming Events</Text>
                    <Text style={styles.emptyText}>No upcoming events</Text>
                </View>
            );
        }

        return (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Upcoming Events</Text>

                {todayEvents.length > 0 && (
                    <View style={styles.eventSection}>
                        <Text style={styles.eventSectionTitle}>Today</Text>
                        {todayEvents.map(renderEventCard)}
                    </View>
                )}

                {weekendEvents.length > 0 && (
                    <View style={styles.eventSection}>
                        <Text style={styles.eventSectionTitle}>This Weekend</Text>
                        {weekendEvents.map(renderEventCard)}
                    </View>
                )}

                {upcomingEvents.length > 0 && (
                    <View style={styles.eventSection}>
                        <Text style={styles.eventSectionTitle}>Coming Soon</Text>
                        {upcomingEvents.map(renderEventCard)}
                    </View>
                )}
            </View>
        );
    };

    return (
        <ScrollView style={styles.container}>
            {/* Header with venue name, type, address and distance */}
            <View style={[
                styles.header,
                isClub ? styles.clubHeader : styles.barHeader
            ]}>
                <View style={styles.headerTopRow}>
                    <Text style={styles.name}>{venue.name}</Text>
                    <View style={[
                        styles.typeBadge,
                        isClub ? styles.clubBadge : styles.barBadge
                    ]}>
                        <Text style={styles.typeBadgeText}>{isClub ? 'Club' : 'Bar'}</Text>
                    </View>
                </View>

                {/* New Attributes Row */}
                <View style={styles.attributeRow}>
                    {venue.smoking_allowed && (
                        <View style={styles.attributeBadge}>
                            <Text style={styles.attributeText}>🚬 Smoking Allowed</Text>
                        </View>
                    )}
                    {venue.bar_types && venue.bar_types.map((type, index) => (
                        <View key={index} style={styles.attributeBadge}>
                            <Text style={styles.attributeText}>{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
                        </View>
                    ))}
                </View>

                <Text style={styles.address}>{venue.address}</Text>

                {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" style={styles.distanceLoader} />
                ) : distance ? (
                    <Text style={styles.distanceText}>{formatDistance(distance)}</Text>
                ) : null}
            </View>

            {/* Different content sections based on venue type */}
            {isClub ? (
                // Club-specific content
                <>
                    {venue.event_name && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Event</Text>
                            <Text style={styles.eventName}>{venue.event_name}</Text>

                            {venue.event_date && (
                                <Text style={styles.eventDetail}>{formatDate(venue.event_date)}</Text>
                            )}

                            {(venue.start_time || venue.end_time) && (
                                <Text style={styles.eventDetail}>
                                    Time: {formatTime(venue.start_time, venue.end_time)}
                                </Text>
                            )}

                            {venue.price && (
                                <Text style={styles.eventPrice}>Price: {venue.price}</Text>
                            )}

                            {venue.popularity && (
                                <View style={[
                                    styles.popularityBadge,
                                    venue.popularity.toLowerCase() === 'high' ? styles.highPopularity :
                                        venue.popularity.toLowerCase() === 'medium' ? styles.mediumPopularity :
                                            styles.lowPopularity
                                ]}>
                                    <Text style={styles.popularityText}>
                                        {venue.popularity} popularity
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}
                </>
            ) : (
                // Bar-specific content - now playing
                venue.currentTrack && venue.currentTrack.name && venue.currentTrack.artist && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Now Playing</Text>
                        <View style={styles.nowPlaying}>
                            <Text style={styles.trackName}>{venue.currentTrack.name}</Text>
                            <Text style={styles.artistName}>by {venue.currentTrack.artist}</Text>
                        </View>
                    </View>
                )
            )}

            {/* Events section - show if venue has events */}
            {renderEvents()}

            {/* Common sections for both types */}
            {venue.description && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>About</Text>
                    <Text style={styles.descriptionText}>{venue.description}</Text>
                </View>
            )}

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Genres</Text>
                <View style={styles.genreContainer}>
                    {venue.genres?.map((genre, index) => (
                        <View key={index} style={[
                            styles.genreBadge,
                            isClub ? styles.clubGenreBadge : styles.barGenreBadge
                        ]}>
                            <Text style={styles.genreText}>{genre}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {venue.openingHours && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Opening Hours</Text>
                    <Text style={styles.infoText}>{venue.openingHours}</Text>
                </View>
            )}

            {venue.phone && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Contact</Text>
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${venue.phone}`)}>
                        <Text style={styles.phoneText}>{venue.phone}</Text>
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.section}>
                <TouchableOpacity
                    style={[
                        styles.button,
                        isClub ? styles.clubButton : styles.barButton
                    ]}
                    onPress={openMaps}
                >
                    <Text style={styles.buttonText}>Get Directions</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    header: {
        padding: 20,
    },
    barHeader: {
        backgroundColor: '#D35400', // Theme color for bars
    },
    clubHeader: {
        backgroundColor: '#6200EA', // Purple for clubs
    },
    headerTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 5,
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
        flex: 1,
    },
    typeBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        marginLeft: 10,
    },
    clubBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    barBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    typeBadgeText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 12,
    },
    attributeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    attributeBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    attributeText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '500',
    },
    address: {
        fontSize: 16,
        color: '#FFFFFF',
        opacity: 0.8,
        marginBottom: 5,
    },
    distanceText: {
        fontSize: 14,
        color: '#FFFFFF',
        fontWeight: '500',
        marginTop: 5,
    },
    distanceLoader: {
        marginTop: 5,
    },
    section: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 15,
    },
    eventSection: {
        marginBottom: 20,
    },
    eventSectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#D35400',
        marginBottom: 10,
    },
    loadingContainer: {
        padding: 20,
        alignItems: 'center',
    },
    loadingText: {
        color: '#CCCCCC',
        marginTop: 10,
    },
    emptyText: {
        color: '#CCCCCC',
        fontStyle: 'italic',
        textAlign: 'center',
    },
    // Now playing styles for bars
    nowPlaying: {
        backgroundColor: 'rgba(29, 185, 84, 0.1)',
        padding: 15,
        borderRadius: 8,
    },
    trackName: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
        marginBottom: 5,
    },
    artistName: {
        color: '#CCCCCC',
        fontSize: 14,
    },
    // Event styles for clubs
    eventName: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 18,
        marginBottom: 10,
    },
    eventDetail: {
        color: '#CCCCCC',
        fontSize: 14,
        marginBottom: 5,
    },
    eventPrice: {
        color: '#D35400',
        fontSize: 14,
        fontWeight: '500',
        marginTop: 5,
    },
    popularityBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 4,
        marginTop: 10,
    },
    highPopularity: {
        backgroundColor: '#F44336', // Red
    },
    mediumPopularity: {
        backgroundColor: '#FF9800', // Orange
    },
    lowPopularity: {
        backgroundColor: '#4CAF50', // Green
    },
    popularityText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'bold',
    },
    // Genre styles
    genreContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    genreBadge: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
        marginBottom: 8,
    },
    barGenreBadge: {
        backgroundColor: '#333333',
    },
    clubGenreBadge: {
        backgroundColor: '#4A148C', // Darker purple for clubs
    },
    genreText: {
        color: '#FFFFFF',
        fontSize: 14,
    },
    // Common styles
    descriptionText: {
        color: '#FFFFFF',
        fontSize: 14,
        lineHeight: 22,
    },
    infoText: {
        color: '#FFFFFF',
        fontSize: 14,
    },
    phoneText: {
        color: '#D35400',
        fontSize: 14,
        textDecorationLine: 'underline',
    },
    button: {
        padding: 15,
        borderRadius: 5,
        alignItems: 'center',
    },
    barButton: {
        backgroundColor: '#D35400',
    },
    clubButton: {
        backgroundColor: '#6200EA',
    },
    buttonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    // Event card styles
    eventCard: {
        backgroundColor: '#2A2A2A',
        borderRadius: 8,
        padding: 15,
        marginBottom: 15,
    },
    eventDescription: {
        color: '#CCCCCC',
        fontSize: 14,
        marginTop: 5,
        marginBottom: 10,
        lineHeight: 20,
    },
});

export default VenueDetailsScreen;
