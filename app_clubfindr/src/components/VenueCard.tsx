import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Venue } from '../services/discoveryService';
import { colors } from '../theme';
import { eventBadgeText, formatEventDate } from '../utils/venueEventDates';
import { toLocalIsoDate } from '../utils/localDate';

type VenueCardProps = {
    venue: Venue;
    onPress: (venue: Venue) => void;
};

const VenueCard = ({ venue, onPress }: VenueCardProps) => {
    // Get basic venue properties with fallbacks
    const venueName = typeof venue.name === 'string' ? venue.name : '';
    const venueAddress = typeof venue.address === 'string' ? venue.address : '';
    const isClub = venue.venueType === 'club';

    // Format distance in a readable way
    const formatDistance = (meters?: number): string => {
        if (typeof meters !== 'number' || isNaN(meters)) return '';

        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km away`;
        } else {
            return `${Math.round(meters)} m away`;
        }
    };

    // Dates as local calendar days (utils/venueEventDates, KNOWN_ISSUES 80)
    const formatDate = (dateStr: string): string => formatEventDate(dateStr);

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

    const getEventBadgeText = (): string => eventBadgeText(venue.events);

    // Safely check if we have current track info
    const hasCurrentTrack = venue.currentTrack &&
        typeof venue.currentTrack.name === 'string' &&
        typeof venue.currentTrack.artist === 'string';

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
                        {venue.events.slice(0, 3).map((event) => {
                            // Use current date if event_date is invalid or missing
                            const eventDate = event.event_date || toLocalIsoDate();

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
        backgroundColor: colors.greenA20,
    },
    mainGenreText: {
        color: colors.green,
        fontSize: 12,
        fontWeight: '500',
    },
    artistsContainer: {
        flexDirection: 'row',
        marginTop: 8,
        alignItems: 'center',
    },
    artistsLabel: {
        color: colors.textSecondary,
        fontSize: 12,
        fontWeight: 'bold',
        marginRight: 5,
    },
    artistsList: {
        color: colors.text,
        fontSize: 12,
        flex: 1,
    },
    eventBadge: {
        position: 'absolute',
        top: 40, // Moved down to avoid overlap with match percentage
        right: 10,
        backgroundColor: colors.green,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        zIndex: 1,
    },
    eventBadgeText: {
        color: colors.text,
        fontSize: 12,
        fontWeight: 'bold',
    },
    eventsContainer: {
        marginTop: 10,
    },
    eventCard: {
        backgroundColor: colors.whiteA10,
        borderRadius: 8,
        padding: 12,
        marginRight: 10,
        width: 200,
    },
    eventName: {
        color: colors.text,
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    eventDate: {
        color: colors.green,
        fontSize: 12,
        marginBottom: 2,
    },
    eventTime: {
        color: colors.textSecondary,
        fontSize: 12,
        marginBottom: 4,
    },
    eventDescription: {
        color: colors.textSecondary,
        fontSize: 12,
        marginBottom: 6,
    },
    eventGenres: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
    },
    eventGenreBadge: {
        backgroundColor: colors.greenA20,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 6,
        marginBottom: 4,
    },
    eventGenreText: {
        color: colors.green,
        fontSize: 10,
    },
    moreEventsCard: {
        backgroundColor: colors.whiteA05,
        borderRadius: 8,
        padding: 12,
        marginRight: 10,
        width: 100,
        justifyContent: 'center',
        alignItems: 'center',
    },
    moreEventsText: {
        color: colors.green,
        fontSize: 12,
        textAlign: 'center',
    },
    container: {
        borderRadius: 8,
        padding: 15,
        marginBottom: 10,
    },
    barContainer: {
        backgroundColor: colors.card,
    },
    clubContainer: {
        backgroundColor: colors.card,
        borderLeftWidth: 4,
        borderLeftColor: colors.purple, // Purple accent for clubs
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
        color: colors.text,
        flex: 1,
    },
    matchBadge: {
        backgroundColor: colors.primary,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    matchText: {
        color: colors.text,
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
        color: colors.textSecondary,
        fontSize: 14,
        flex: 1,
    },
    distanceText: {
        color: colors.primary,
        fontSize: 12,
        fontWeight: '500',
        marginLeft: 10,
    },
    nowPlaying: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.greenA10,
        padding: 10,
        borderRadius: 4,
        marginBottom: 10,
    },
    playingIcon: {
        width: 16,
        height: 16,
        marginRight: 10,
        backgroundColor: colors.primary,
        borderRadius: 8,
    },
    trackName: {
        color: colors.text,
        fontWeight: 'bold',
    },
    artistName: {
        color: colors.textSecondary,
        fontSize: 12,
    },
    barGenreBadge: {
        backgroundColor: colors.grey800,
    },
    clubGenreBadge: {
        backgroundColor: colors.purpleDark, // Darker purple for club genres
    },
    moreGenres: {
        color: colors.textSecondary,
        fontSize: 12,
        alignSelf: 'center',
    },
});

export default VenueCard;
