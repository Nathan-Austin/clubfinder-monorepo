/**
 * The venue side's Overview tab (ROADMAP "Venue side of the app", step 9): tonight at a glance.
 * The venue's name, its visitor counts, its next event and its check-in code. The events list
 * moved to the Events tab, the QR codes into the Venue tab; the two cards here lead to them.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useVenue } from '../contexts/VenueContext';
import axiosClient from '../api/axiosClient';
import BarStatsDashboard from '../components/BarStatsDashboard';
import { useVenueEvents } from '../hooks/useVenueEvents';
import { nextVenueEvent } from '../services/venueEventsService';
import { formatEventDate, formatEventTimes } from '../utils/eventFormat';
import { toLocalIsoDate } from '../utils/localDate';
import { colors } from '../theme';

const BarHomeScreen = () => {
    const navigation = useNavigation<{ navigate: (screen: string, params?: object) => void }>();
    // Read once by the venue side's provider; the name follows Edit Profile at once
    const { barId, barName } = useVenue();
    const venueEvents = useVenueEvents(barId);
    const next = nextVenueEvent(venueEvents.events, toLocalIsoDate());

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [topGenres, setTopGenres] = useState<{ genre: string, count: number }[]>([]);

    // Stats state
    const [visitorsToday, setVisitorsToday] = useState(0);
    const [visitorsWeek, setVisitorsWeek] = useState(0);
    const [visitorsChange, setVisitorsChange] = useState(0);

    useEffect(() => {
        loadBarDetails();
        loadBarStats();
    }, []);

    const loadBarDetails = async () => {
        try {
            if (!barId) return;

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

    const loadBarStats = async () => {
        try {
            const statsResponse = await axiosClient.get('/api/mobile/bars/stats');
            if (statsResponse.data.success) {
                const stats = statsResponse.data.stats;
                setVisitorsToday(stats.visitorsToday || 0);
                setVisitorsWeek(stats.visitorsWeek || 0);
                setVisitorsChange(stats.weekOverWeekChange || 0);
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
            await Promise.all([loadBarDetails(), venueEvents.reload(), loadBarStats()]);
        } finally {
            setRefreshing(false);
        }
    }, [venueEvents.reload]);

    const nextTimes = next ? formatEventTimes(next.start_time, next.end_time) : '';

    return (
        <ScrollView
            style={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
            <View style={styles.header}>
                <Text style={styles.barName}>{barName || 'My venue'}</Text>
                <Text style={styles.subtitle}>Tonight at a glance</Text>
            </View>

            <BarStatsDashboard
                loading={loading}
                topGenres={topGenres}
                visitorsToday={visitorsToday}
                visitorsWeek={visitorsWeek}
                compareToLastWeek={visitorsChange}
                onRefresh={handleRefresh}
            />

            <View style={styles.cards}>
                {/* Next event: leads to the Events tab */}
                <TouchableOpacity
                    style={styles.card}
                    onPress={() => navigation.navigate(next ? 'Events' : 'AddEvent')}
                    accessibilityRole="button"
                    testID="overview-next-event"
                >
                    <Ionicons name="calendar-outline" size={24} color={colors.primary} />
                    <View style={styles.cardText}>
                        <Text style={styles.cardLabel}>Next event</Text>
                        {venueEvents.loading ? (
                            <Text style={styles.cardHint}>Loading…</Text>
                        ) : venueEvents.failed ? (
                            <Text style={styles.cardHint}>Could not load your events. Pull down to try again.</Text>
                        ) : next ? (
                            <>
                                <Text style={styles.cardTitle}>{next.theme_name}</Text>
                                <Text style={styles.cardHint}>
                                    {formatEventDate(next.event_date)}
                                    {nextTimes ? `, ${nextTimes}` : ''}
                                </Text>
                            </>
                        ) : (
                            <Text style={styles.cardHint}>Nothing planned yet. Tap to add an event.</Text>
                        )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>

                {/* Check-in code: what the door shows; the codes live under Venue */}
                <TouchableOpacity
                    style={styles.card}
                    onPress={() => navigation.navigate('QRCodeGenerator')}
                    accessibilityRole="button"
                    testID="overview-checkin-code"
                >
                    <Ionicons name="qr-code-outline" size={24} color={colors.primary} />
                    <View style={styles.cardText}>
                        <Text style={styles.cardLabel}>Check-in code</Text>
                        <Text style={styles.cardHint}>Show, share or print the code guests scan at the door</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        backgroundColor: colors.primary,
        padding: 20,
        alignItems: 'center',
    },
    barName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.onPrimary,
        marginBottom: 5,
    },
    subtitle: {
        fontSize: 16,
        color: colors.onPrimary,
        opacity: 0.8,
    },
    cards: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: 8,
        padding: 14,
        marginBottom: 12,
    },
    cardText: {
        flex: 1,
        marginHorizontal: 12,
    },
    cardLabel: {
        color: colors.textMuted,
        fontSize: 12,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    cardTitle: {
        color: colors.text,
        fontSize: 16,
        fontWeight: '600',
    },
    cardHint: {
        color: colors.textMuted,
        fontSize: 14,
    },
});

export default BarHomeScreen;
