/**
 * One of the venue's events on its Events tab: name, day, times, description, genres, and edit
 * and delete buttons (delete shows a spinner while it runs). Moved out of the dashboard.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VenueEvent } from '../services/venueEventsService';
import { formatEventDate, formatEventTimes, formatRecurrence } from '../utils/eventFormat';
import { colors } from '../theme';

type Props = {
    event: VenueEvent;
    onEdit: (event: VenueEvent) => void;
    onDelete: (event: VenueEvent) => void;
    /** This event is being deleted */
    deleting?: boolean;
    /** Another delete is running */
    disabled?: boolean;
};

const VenueEventCard = ({ event, onEdit, onDelete, deleting = false, disabled = false }: Props) => {
    const times = formatEventTimes(event.start_time, event.end_time);
    return (
        <View style={styles.card} testID="venue-event">
            <View style={styles.header}>
                <Text style={styles.name}>{event.theme_name}</Text>
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={styles.action}
                        onPress={() => onEdit(event)}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${event.theme_name}`}
                    >
                        <Ionicons name="create-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.action}
                        onPress={() => onDelete(event)}
                        disabled={disabled || deleting}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${event.theme_name}`}
                    >
                        {deleting ? (
                            <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                            <Ionicons name="trash-outline" size={20} color={colors.danger} />
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.dateRow}>
                <Text style={styles.date}>{formatEventDate(event.event_date)}</Text>
                {event.recurring && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{formatRecurrence(event.recurrence_pattern)}</Text>
                    </View>
                )}
                {/* Live music is an attribute of the night, not a genre (ROADMAP section 5) */}
                {event.live_music && (
                    <View style={[styles.badge, styles.liveBadge]}>
                        <Text style={styles.badgeText}>Live music</Text>
                    </View>
                )}
            </View>

            {times ? <Text style={styles.times}>{times}</Text> : null}
            {event.description ? <Text style={styles.description}>{event.description}</Text> : null}

            {event.special_genres.length > 0 && (
                <View style={styles.genres}>
                    {event.special_genres.map((genre) => (
                        <View key={genre} style={styles.genre}>
                            <Text style={styles.genreText}>{genre}</Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.card,
        borderRadius: 8,
        padding: 14,
        marginBottom: 12,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    name: {
        flex: 1,
        color: colors.text,
        fontSize: 17,
        fontWeight: 'bold',
    },
    actions: {
        flexDirection: 'row',
    },
    action: {
        padding: 6,
        marginLeft: 6,
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginTop: 6,
    },
    date: {
        color: colors.text,
        fontSize: 14,
        marginRight: 8,
    },
    badge: {
        backgroundColor: colors.border,
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    liveBadge: {
        backgroundColor: colors.green,
    },
    badgeText: {
        color: colors.text,
        fontSize: 12,
    },
    times: {
        color: colors.textMuted,
        fontSize: 14,
        marginTop: 4,
    },
    description: {
        color: colors.textMuted,
        fontSize: 14,
        marginTop: 8,
    },
    genres: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
    },
    genre: {
        backgroundColor: colors.surface,
        borderColor: colors.primary,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 3,
        marginRight: 6,
        marginBottom: 6,
    },
    genreText: {
        color: colors.text,
        fontSize: 12,
    },
});

export default VenueEventCard;
