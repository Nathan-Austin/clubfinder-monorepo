/**
 * The venue side's Events tab (ROADMAP "Venue side of the app", step 9): the venue's upcoming
 * events, add, edit and delete. They were the lower half of the dashboard.
 *
 * Recurring events show once, on their first date: the server does not expand them into dates
 * yet, and drops them after that date (KNOWN_ISSUES 90). Deleting one deletes the series
 * (KNOWN_ISSUES 89).
 */
import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useVenue } from '../contexts/VenueContext';
import { useVenueEvents } from '../hooks/useVenueEvents';
import { deleteBarEvent } from '../services/mobileBarService';
import type { VenueEvent } from '../services/venueEventsService';
import VenueEventCard from '../components/VenueEventCard';
import LoadError from '../components/LoadError';
import { formatEventDate } from '../utils/eventFormat';
import { colors } from '../theme';

const VenueEventsScreen = () => {
    const navigation = useNavigation<{ navigate: (screen: string, params?: object) => void }>();
    const { logout } = useAuth();
    const { barId } = useVenue();
    const { events, loading, failed, reload, drop } = useVenueEvents(barId);
    const [refreshing, setRefreshing] = useState(false);
    const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

    const refresh = async () => {
        setRefreshing(true);
        await reload();
        setRefreshing(false);
    };

    const addEvent = () => navigation.navigate('AddEvent');
    const editEvent = (event: VenueEvent) => navigation.navigate('EditEvent', { event });

    // KNOWN_ISSUES 82: the delete the dashboard had, asking first
    const deleteEvent = async (event: VenueEvent) => {
        setDeletingEventId(event.id);
        try {
            const result = await deleteBarEvent(barId ?? '', event.id);
            if (result.success) {
                drop(event.id);
                await reload();
            } else if (result.sessionEnded) {
                Alert.alert('Session ended', result.error, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Log in', onPress: () => logout() },
                ]);
            } else {
                Alert.alert('Could not delete', result.error);
            }
        } finally {
            setDeletingEventId(null);
        }
    };

    const confirmDelete = (event: VenueEvent) => {
        if (deletingEventId) return;
        Alert.alert(
            'Delete event?',
            `"${event.theme_name}" on ${formatEventDate(event.event_date)} will be removed. This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => void deleteEvent(event) },
            ]
        );
    };

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        >
            <View style={styles.header}>
                <Text style={styles.title}>Upcoming events</Text>
                <TouchableOpacity style={styles.addButton} onPress={addEvent} accessibilityRole="button" testID="add-event">
                    <Ionicons name="add" size={20} color={colors.onPrimary} />
                    <Text style={styles.addButtonText}>Add event</Text>
                </TouchableOpacity>
            </View>

            {loading ? null : failed ? (
                <LoadError message="We couldn't load your events just now." onRetry={refresh} retrying={refreshing} />
            ) : events.length === 0 ? (
                <View style={styles.empty} testID="venue-events-empty">
                    <Text style={styles.emptyTitle}>No upcoming events</Text>
                    <Text style={styles.emptyText}>
                        Add themed nights, recurring events or one-off occasions. Their genres count for
                        more than your venue's usual ones on the day.
                    </Text>
                    <TouchableOpacity style={styles.addButton} onPress={addEvent} accessibilityRole="button">
                        <Text style={styles.addButtonText}>Create your first event</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                events.map((event) => (
                    <VenueEventCard
                        key={event.occurrence_id}
                        event={event}
                        onEdit={editEvent}
                        onDelete={confirmDelete}
                        deleting={deletingEventId === event.id}
                        disabled={deletingEventId !== null}
                    />
                ))
            )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        padding: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        color: colors.text,
        fontSize: 18,
        fontWeight: 'bold',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: colors.primary,
        borderRadius: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    addButtonText: {
        color: colors.onPrimary,
        fontWeight: '600',
        marginLeft: 4,
    },
    empty: {
        backgroundColor: colors.card,
        borderRadius: 8,
        padding: 20,
    },
    emptyTitle: {
        color: colors.text,
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 6,
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: 14,
        marginBottom: 14,
    },
});

export default VenueEventsScreen;
