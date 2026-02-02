import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Venue, Event } from '../services/discoveryService';

type VenueCardProps = {
    venue: Venue;
    onPress: (venue: Venue) => void;
};

const VenueCard = ({ venue, onPress }: VenueCardProps) => {
    // Get basic venue properties with fallbacks
    const venueName = typeof venue.name === 'string' ? venue.name : '';
    const venueAddress = typeof venue.address === 'string' ? venue.address : '';
    const isClub = venue.venueType === 'club';
    const venueGenres = Array.isArray(venue.genres) ? venue.genres : [];

    // Format distance in a readable way
    const formatDistance = (meters?: number): string => {
        if (typeof meters !== 'number' || isNaN(meters)) return '';

        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km away`;
        } else {
            return `${Math.round(meters)} m away`;
        }
    };

    // Format date for display
    const formatDate = (dateStr: string): string => {
        try {
            // Ensure we handle ISO format properly by explicitly parsing
            const [datePart] = dateStr.split('T');
            const date = new Date(datePart);

            // Check if date is valid
            if (isNaN(date.getTime())) {
                throw new Error('Invalid date');
            }

            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            if (date.toDateString() === today.toDateString()) {
                return 'Today';
            } else if (date.toDateString() === tomorrow.toDateString()) {
                return 'Tomorrow';
            } else if (date.getTime() < today.getTime() + 7 * 24 * 60 * 60 * 1000) {
                return date.toLocaleDateString('en-US', { weekday: 'long' });
            } else {
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
        } catch (e) {
            console.warn('Date parsing error:', e);
            return 'Date TBA';
        }
    };

    // Format time for display
    const formatTime = (timeStr?: string): string => {
        if (!timeStr) return '';

        const [hours, minutes] = timeStr.split(':');
        const hour = parseInt(hours);

        if (hour === 0) {
            return `12:${minutes} AM`;
        } else if (hour < 12) {
            return `${hour}:${minutes} AM`;
        } else if (hour === 12) {
            return `12:${minutes} PM`;
        } else {
            return `${hour - 12}:${minutes} PM`;
        }
    };

    // Check if venue has events today
    const hasEventsToday = (): boolean => {
        if (!venue.events || venue.events.length === 0) return false;
        const today = new Date().toDateString();
        return venue.events.some(event => new Date(event.event_date).toDateString() === today);
    };

    // Get event badge text
    const getEventBadgeText = (): string => {
        if (!venue.events || venue.events.length === 0) return '';

        const currentDate = new Date().toISOString().split('T')[0];

        const todayEvents = venue.events.filter(event => {
            const eventDate = event.event_date || currentDate;
            const [datePart] = eventDate.split('T');
            return new Date(datePart).toDateString() === new Date().toDateString();
        });

        if (todayEvents.length > 0) {
            return `${todayEvents.length} Event${todayEvents.length > 1 ? 's' : ''} Today`;
        } else {
            const sortedEvents = [...venue.events].sort((a, b) => {
                const dateA = a.event_date || currentDate;
                const dateB = b.event_date || currentDate;
                const [datePartA] = dateA.split('T');
                const [datePartB] = dateB.split('T');
                return new Date(datePartA).getTime() - new Date(datePartB).getTime();
            });
            const nextEventDate = sortedEvents[0].event_date || currentDate;
            return `Next Event: ${formatDate(nextEventDate)}`;
        }
    };

    // Safely check if we have current track info
    const hasCurrentTrack = venue.currentTrack &&
        typeof venue.currentTrack.name === 'string' &&
        typeof venue.currentTrack.artist === 'string';

    // Safely format time range
    const formatTimeRange = (start?: string, end?: string): string => {
        if (typeof start !== 'string') return '';

        if (typeof end === 'string' && end) {
            return `${start} - ${end}`;
        }

        return start;
    };

    // Safely get similarity score
    const getSimilarityDisplay = (): string => {
        if (typeof venue.similarity !== 'number' || isNaN(venue.similarity)) {
            return '';
        }
        return `${Math.round(venue.similarity * 100)}% Match`;
    };

    return (
        <TouchableOpacity
            style={[styles.container, isClub ? styles.clubContainer : styles.barContainer]}
            onPress={() => onPress(venue)}
        >
            <View style={styles.header}>
                <Text style={styles.name}>{venueName}</Text>

                {typeof venue.similarity === 'number' && !isNaN(venue.similarity) && (
                    <View style={styles.matchBadge}>
                        <Text style={styles.matchText}>{getSimilarityDisplay()}</Text>
                    </View>
                )}
            </View>

            <View style={styles.infoRow}>
                <View style={styles.addressRow}>
                    <Text style={styles.address}>{venueAddress}</Text>
                    {typeof venue.distance === 'number' && !isNaN(venue.distance) && (
                        <Text style={styles.distanceText}>
                            {formatDistance(venue.distance)}
                        </Text>
                    )}
                </View>
            </View>

            {/* Show top genres below address */}
            {venue.topGenres && venue.topGenres.length > 0 && (
                <View style={styles.mainGenres}>
                    {venue.topGenres.map((genre, index) => (
                        <View key={index} style={[
                            styles.mainGenreBadge,
                            isClub ? styles.clubGenreBadge : styles.barGenreBadge
                        ]}>
                            <Text style={styles.mainGenreText}>{genre}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Artists section for clubs */}
            {isClub && venue.artists && venue.artists.length > 0 && (
                <View style={styles.artistsContainer}>
                    <Text style={styles.artistsLabel}>Lineup: </Text>
                    <Text style={styles.artistsList} numberOfLines={2}>
                        {venue.artists.map(a => a.name.replace(/\b\w/g, l => l.toUpperCase())).join(', ')}
                    </Text>
                </View>
            )}

            {/* Event badge if venue has events */}
            {venue.events && venue.events.length > 0 && (
                <View style={styles.eventBadge}>
                    <Text style={styles.eventBadgeText}>{getEventBadgeText()}</Text>
                </View>
            )}

            {/* Show current track for bars */}
            {!isClub && hasCurrentTrack && (
                <View style={styles.nowPlaying}>
                    <View style={styles.playingIcon} />
                    <View>
                        <Text style={styles.trackName}>
                            {venue.currentTrack?.name || ''}
                        </Text>
                        <Text style={styles.artistName}>
                            {venue.currentTrack?.artist || ''}
                        </Text>
                    </View>
                </View>
            )}

            {/* Events section */}
            {venue.events && venue.events.length > 0 && (
                <View style={styles.eventsContainer}>
                    <ScrollView horizontal={true} showsHorizontalScrollIndicator={false}>
                        {venue.events.slice(0, 3).map((event, index) => {
                            // Use current date if event_date is invalid or missing
                            const eventDate = event.event_date || new Date().toISOString().split('T')[0];

                            return (
                                <View key={event.id} style={styles.eventCard}>
                                    <Text style={styles.eventName}>{event.theme_name}</Text>
                                    <Text style={styles.eventDate}>{formatDate(eventDate)}</Text>
                                    {event.start_time && (
                                        <Text style={styles.eventTime}>
                                            {formatTime(event.start_time)}
                                        </Text>
                                    )}
                                    {event.description && (
                                        <Text style={styles.eventDescription} numberOfLines={2}>
                                            {event.description}
                                        </Text>
                                    )}
                                    {event.special_genres && event.special_genres.length > 0 && (
                                        <View style={styles.eventGenres}>
                                            {event.special_genres.slice(0, 2).map((genre, idx) => (
                                                <View key={idx} style={styles.eventGenreBadge}>
                                                    <Text style={styles.eventGenreText}>{genre}</Text>
                                                </View>
                                            ))}
                                            {event.special_genres.length > 2 && (
                                                <Text style={styles.moreGenres}>
                                                    +{event.special_genres.length - 2}
                                                </Text>
                                            )}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                        {venue.events.length > 3 && (
                            <View style={styles.moreEventsCard}>
                                <Text style={styles.moreEventsText}>
                                    +{venue.events.length - 3} more events
                                </Text>
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}

        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    addressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    mainGenres: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
    },
    mainGenreBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 16,
        marginRight: 6,
        marginBottom: 4,
        backgroundColor: 'rgba(29, 185, 84, 0.2)',
    },
    mainGenreText: {
        color: '#1db954',
        fontSize: 12,
        fontWeight: '500',
    },
    artistsContainer: {
        flexDirection: 'row',
        marginTop: 8,
        alignItems: 'center',
    },
    artistsLabel: {
        color: '#CCCCCC',
        fontSize: 12,
        fontWeight: 'bold',
        marginRight: 5,
    },
    artistsList: {
        color: '#FFFFFF',
        fontSize: 12,
        flex: 1,
    },
    eventBadge: {
        position: 'absolute',
        top: 40, // Moved down to avoid overlap with match percentage
        right: 10,
        backgroundColor: '#1db954',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        zIndex: 1,
    },
    eventBadgeText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'bold',
    },
    eventsContainer: {
        marginTop: 10,
    },
    eventCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
        padding: 12,
        marginRight: 10,
        width: 200,
    },
    eventName: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    eventDate: {
        color: '#1db954',
        fontSize: 12,
        marginBottom: 2,
    },
    eventTime: {
        color: '#CCCCCC',
        fontSize: 12,
        marginBottom: 4,
    },
    eventDescription: {
        color: '#CCCCCC',
        fontSize: 12,
        marginBottom: 6,
    },
    eventGenres: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
    },
    eventGenreBadge: {
        backgroundColor: 'rgba(29, 185, 84, 0.2)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 6,
        marginBottom: 4,
    },
    eventGenreText: {
        color: '#1db954',
        fontSize: 10,
    },
    moreEventsCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 8,
        padding: 12,
        marginRight: 10,
        width: 100,
        justifyContent: 'center',
        alignItems: 'center',
    },
    moreEventsText: {
        color: '#1db954',
        fontSize: 12,
        textAlign: 'center',
    },
    container: {
        borderRadius: 8,
        padding: 15,
        marginBottom: 10,
    },
    barContainer: {
        backgroundColor: '#2A2A2A',
    },
    clubContainer: {
        backgroundColor: '#2A2A2A',
        borderLeftWidth: 4,
        borderLeftColor: '#6200EA', // Purple accent for clubs
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 5,
    },
    name: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        flex: 1,
    },
    matchBadge: {
        backgroundColor: '#D35400',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    matchText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'bold',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    address: {
        color: '#CCCCCC',
        fontSize: 14,
        flex: 1,
    },
    distanceText: {
        color: '#D35400',
        fontSize: 12,
        fontWeight: '500',
        marginLeft: 10,
    },
    nowPlaying: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(29, 185, 84, 0.1)',
        padding: 10,
        borderRadius: 4,
        marginBottom: 10,
    },
    playingIcon: {
        width: 16,
        height: 16,
        marginRight: 10,
        backgroundColor: '#D35400',
        borderRadius: 8,
    },
    trackName: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    artistName: {
        color: '#CCCCCC',
        fontSize: 12,
    },
    eventInfo: {
        backgroundColor: 'rgba(98, 0, 234, 0.1)', // Light purple background for club events
        padding: 10,
        borderRadius: 4,
        marginBottom: 10,
    },
    genreContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    genreBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 6,
        marginBottom: 6,
    },
    barGenreBadge: {
        backgroundColor: '#333333',
    },
    clubGenreBadge: {
        backgroundColor: '#4A148C', // Darker purple for club genres
    },
    genreText: {
        color: '#FFFFFF',
        fontSize: 12,
    },
    moreGenres: {
        color: '#CCCCCC',
        fontSize: 12,
        alignSelf: 'center',
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
    eventLabel: {
        color: '#999999',
        fontSize: 12,
    },
    eventValue: {
        color: '#FFFFFF',
        fontSize: 12,
    },
});

export default VenueCard;
