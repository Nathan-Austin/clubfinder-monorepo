import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    SectionList,
    RefreshControl
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MainTabParamList, RootStackParamList } from '../navigation';

type TilkiScreenRouteProp = RouteProp<MainTabParamList, 'Tilki'>;
import * as discoveryService from '../services/discoveryService';
import SafeVenueCard from '../components/SafeVenueCard';
import VenueToggle from '../components/VenueToggle';
import DateSelector from '../components/DateSelector';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosClient from '../api/axiosClient';
import { cityForQueries } from '../services/cityService';
import LoadError from '../components/LoadError';
import { venueList } from '../utils/venueResponse';
import { log } from '../utils/logger';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

type TilkiScreenNavigationProp = StackNavigationProp<MainTabParamList & RootStackParamList, 'Tilki'>;

// Type for section data
type VenueSection = {
    date: string;
    title: string;
    data: discoveryService.Venue[];
};

const TilkiScreen = () => {
    // Force refresh counter
    const [refreshKey, setRefreshKey] = useState(0);

    // Venue data
    const [venues, setVenues] = useState<discoveryService.Venue[]>([]);
    const [venueSections, setVenueSections] = useState<VenueSection[]>([]);
    const [venueType, setVenueType] = useState<'bar' | 'club'>('bar');
    // Live music is an attribute of the night, not a genre (ROADMAP section 5): with it on, only
    // venues with a live act that day come back, the taste profile still deciding the order
    const [liveMusicOnly, setLiveMusicOnly] = useState(false);

    // Loading states
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Data states
    const [genres, setGenres] = useState<string[]>([]);
    const [barVenues, setBarVenues] = useState<discoveryService.Venue[]>([]);
    const [clubVenues, setClubVenues] = useState<discoveryService.Venue[]>([]);
    const [barSections, setBarSections] = useState<VenueSection[]>([]);
    const [clubSections, setClubSections] = useState<VenueSection[]>([]);

    // Get today's date in YYYY-MM-DD format for initial date
    const today = new Date();
    const formatDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Date state
    const [selectedDate, setSelectedDate] = useState<string>(formatDate(today));
    const [isDateRange, setIsDateRange] = useState<boolean>(false);
    const [dateRangeStart, setDateRangeStart] = useState<string>(formatDate(today));
    const [dateRangeEnd, setDateRangeEnd] = useState<string>(formatDate(today));

    // Navigation and auth
    const navigation = useNavigation<TilkiScreenNavigationProp>();
    const route = useRoute<TilkiScreenRouteProp>();

    // Ref to track if component is mounted
    const isMounted = useRef(true);

    // Set up effect cleanup
    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Set venue type from navigation params and trigger refresh
    useEffect(() => {
        if (route.params?.venueType) {
            setVenueType(route.params.venueType);
        }
        // Force refresh when refreshKey changes (new selection from DiscoveryScreen)
        if (route.params?.refreshKey) {
            setRefreshKey(prev => prev + 1);
        }
    }, [route.params?.venueType, route.params?.refreshKey]);

    // Load venues when component mounts
    useEffect(() => {
        loadMatchingVenues();
        // liveMusicOnly too: turning the filter on or off asks the server again
    }, [venueType, selectedDate, isDateRange, dateRangeStart, dateRangeEnd, refreshKey, liveMusicOnly]);

    // Format display date
    const formatDisplayDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    };

    // Organize venues by date
    const organizeVenuesByDate = (venues: discoveryService.Venue[], startDate: string, endDate: string): VenueSection[] => {
        log.debug(`Organizing venues by date: ${startDate} to ${endDate}`);
        log.debug(`Total venues to organize: ${venues.length}`);

        // Create a map to store venues grouped by date
        const venuesByDate = new Map<string, discoveryService.Venue[]>();

        // If it's a single date, just create one section
        if (startDate === endDate) {
            log.debug(`Single date: ${startDate}, creating one section`);
            return [{
                date: startDate,
                title: formatDisplayDate(startDate),
                data: venues
            }];
        }

        // Initialize date range
        const dateRange: string[] = [];
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);

        // Generate all dates in the range
        const currentDate = new Date(startDateObj);
        while (currentDate <= endDateObj) {
            const dateStr = formatDate(currentDate);
            dateRange.push(dateStr);
            venuesByDate.set(dateStr, []);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        log.debug(`Date range created: ${dateRange.join(', ')}`);

        // Assign venues to their dates
        venues.forEach(venue => {
            let venueDate = '';

            if (venueType === 'club' && venue.event_date) {
                // For clubs, use the specific event date
                venueDate = venue.event_date;
            } else if (venue.date) {
                // Use the date property we added
                venueDate = venue.date;
            } else {
                // If no date is specified, use the startDate
                venueDate = startDate;
            }

            // Make sure the date is in our range
            if (dateRange.includes(venueDate)) {
                const currentVenues = venuesByDate.get(venueDate) || [];
                currentVenues.push(venue);
                venuesByDate.set(venueDate, currentVenues);
            } else {
                // If date is outside range, put it in the first day
                const currentVenues = venuesByDate.get(startDate) || [];
                currentVenues.push(venue);
                venuesByDate.set(startDate, currentVenues);
            }
        });

        // Convert map to array of sections sorted by date
        const sections: VenueSection[] = [];
        dateRange.forEach(date => {
            const dateVenues = venuesByDate.get(date) || [];

            // Only create sections for dates with venues
            if (dateVenues.length > 0) {
                sections.push({
                    date: date,
                    title: formatDisplayDate(date),
                    data: dateVenues
                });
            }
        });

        return sections;
    };

    // Function to fetch venues based on selected date and venue type
    const loadMatchingVenues = async () => {
        log.debug(`Loading venues for type: ${venueType}, date: ${selectedDate}, isRange: ${isDateRange}`);

        try {
            setLoading(true);
            setLoadFailed(false);

            // Get stored genres
            const storedGenres = await AsyncStorage.getItem('selected-genres');
            if (!storedGenres) {
                setBarVenues([]);
                setClubVenues([]);
                setVenues([]);
                setVenueSections([]);
                setLoading(false);
                return;
            }

            const genresList = storedGenres.split(',');
            setGenres(genresList);

            let barResults: discoveryService.Venue[] = [];
            let clubResults: discoveryService.Venue[] = [];

            // Get city
            const city = await cityForQueries();

            if (isDateRange) {
                log.debug(`Fetching venues for date range: ${dateRangeStart} to ${dateRangeEnd}`);

                // Create array of dates in the range
                const startDate = new Date(dateRangeStart);
                const endDate = new Date(dateRangeEnd);
                const dateRange: string[] = [];

                const currentDate = new Date(startDate);
                while (currentDate <= endDate) {
                    const dateStr = formatDate(currentDate);
                    dateRange.push(dateStr);
                    currentDate.setDate(currentDate.getDate() + 1);
                }

                // Create parallel request arrays
                const barPromises = [];
                const clubPromises = [];
                // For bars - fetch for each date since they now have events
                for (const date of dateRange) {
                    barPromises.push(
                        axiosClient.post('/api/mobile/bars/matching', {
                            city,
                            date,
                            genres: genresList,
                            liveMusic: liveMusicOnly
                        }).then(response => ({
                            date,
                            venues: venueList(response.data, 'bar')
                        }))
                    );
                }

                // For clubs - still need to fetch for each date in the range
                for (const date of dateRange) {
                    // Club request for this date
                    clubPromises.push(
                        axiosClient.post('/api/mobile/events/matching', {
                            city,
                            date, // Keep date parameter for clubs
                            genres: genresList
                        }).then(response => ({
                            date,
                            venues: venueList(response.data, 'club')
                        }))
                    );
                }

                // Wait for all requests. One failed or malformed day fails the whole load, so the
                // screen shows "Try again" rather than a range with days silently missing.
                const barResponses = await Promise.all(barPromises);
                const clubResponses = await Promise.all(clubPromises);

                // Process bar results - add date to each venue for display purposes
                const allBarVenues: discoveryService.Venue[] = [];

                barResponses.forEach(response => {
                    const { date, venues } = response;
                    log.debug(`Got ${venues.length} bars`);

                    allBarVenues.push(...venues.map(venue => ({
                        ...venue,
                        date // Add the date to each venue
                    })));
                });

                // Process club results - event_date should already be in the data
                const allClubVenues: discoveryService.Venue[] = [];

                clubResponses.forEach(response => {
                    const { date, venues } = response;
                    log.debug(`Got ${venues.length} clubs for date ${date}`);

                    allClubVenues.push(...venues.map(venue => ({
                        ...venue,
                        event_date: venue.event_date || date // Ensure event_date is set
                    })));
                });

                log.debug(`Total bars collected across dates: ${allBarVenues.length}`);
                log.debug(`Total clubs collected across dates: ${allClubVenues.length}`);

                // Remove duplicates
                const barVenueMap = new Map<string, discoveryService.Venue>();
                const clubVenueMap = new Map<string, discoveryService.Venue>();

                allBarVenues.forEach(venue => {
                    if (venue.id && !barVenueMap.has(venue.id)) {
                        barVenueMap.set(venue.id, venue);
                    }
                });

                allClubVenues.forEach(venue => {
                    if (venue.id && !clubVenueMap.has(venue.id)) {
                        clubVenueMap.set(venue.id, venue);
                    }
                });

                barResults = Array.from(barVenueMap.values());
                clubResults = Array.from(clubVenueMap.values());

                log.debug(`After deduplication: ${barResults.length} unique bars and ${clubResults.length} unique clubs`);
            } else {
                // For a single date, just fetch venues for that day
                log.debug(`Fetching venues for single date: ${selectedDate}`);

                // For clubs - use the date parameter
                // For single date view

                const [barResponse, clubResponse] = await Promise.all([
                    axiosClient.post('/api/mobile/bars/matching', {
                        city,
                        date: selectedDate, // Use selected date now that bars have events
                        genres: genresList,
                        liveMusic: liveMusicOnly
                    }),
                    axiosClient.post('/api/mobile/events/matching', {
                        city,
                        date: selectedDate, // Date is actually used for filtering clubs
                        genres: genresList
                    })
                ]);

                // Add date to bar venues (for display purposes only)
                barResults = venueList(barResponse.data, 'bar').map((venue) => ({
                    ...venue,
                    date: selectedDate // Add the date for display purposes only
                }));

                // Make sure clubs have event_date set
                clubResults = venueList(clubResponse.data, 'club').map((venue) => ({
                    ...venue,
                    event_date: venue.event_date || selectedDate
                }));

                log.debug(`Fetched ${barResults.length} bars and ${clubResults.length} clubs for date ${selectedDate}`);
            }

            if (!isMounted.current) return;

            // Process bar results to remove duplicates
            const uniqueBarVenues = barResults.filter((venue, index, self) =>
                index === self.findIndex((v) => v.id === venue.id)
            );

            // Process club results to remove duplicates
            const uniqueClubVenues = clubResults.filter((venue, index, self) =>
                index === self.findIndex((v) => v.id === venue.id)
            );

            // Organize venues by date
            const barSections = organizeVenuesByDate(uniqueBarVenues, dateRangeStart, dateRangeEnd);
            const clubSections = organizeVenuesByDate(uniqueClubVenues, dateRangeStart, dateRangeEnd);

            // Update stored values
            setBarVenues(uniqueBarVenues);
            setClubVenues(uniqueClubVenues);
            setBarSections(barSections);
            setClubSections(clubSections);

            // Update current view based on selected venue type
            log.debug(`Setting current venues to ${venueType} venues`);
            setVenues(venueType === 'bar' ? uniqueBarVenues : uniqueClubVenues);
            setVenueSections(venueType === 'bar' ? barSections : clubSections);

        } catch (error) {
            console.error(`Error loading matching ${venueType}s:`, error);
            if (isMounted.current) {
                setBarVenues([]);
                setClubVenues([]);
                setVenues([]);
                setVenueSections([]);
                setLoadFailed(true);
            }
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    };

    // Handle date change
    const handleDateChange = (date: string, isRange: boolean = false, rangeStart?: string, rangeEnd?: string) => {
        log.debug(`Date change called: ${date}, isRange: ${isRange}, range: ${rangeStart} - ${rangeEnd}`);

        // Set the selected date
        setSelectedDate(date);

        // Update date range state if applicable
        setIsDateRange(isRange);
        if (isRange && rangeStart && rangeEnd) {
            setDateRangeStart(rangeStart);
            setDateRangeEnd(rangeEnd);
        } else {
            // For single dates, set range start and end to the same date
            setDateRangeStart(date);
            setDateRangeEnd(date);
        }

        // Force a refresh by incrementing the key
        setRefreshKey(prev => prev + 1);
    };

    // Handle pull-to-refresh
    const onRefresh = async () => {
        try {
            setRefreshing(true);
            // Force a refresh by incrementing the key
            setRefreshKey(prev => prev + 1);
            await loadMatchingVenues();
        } catch (error) {
            console.error('Error refreshing venues:', error);
        } finally {
            setRefreshing(false);
        }
    };

    // Handle venue type change
    const handleVenueTypeChange = (type: 'bar' | 'club') => {
        log.debug(`Venue type changed to: ${type}`);
        setVenueType(type);
        setVenues(type === 'bar' ? barVenues : clubVenues);
        setVenueSections(type === 'bar' ? barSections : clubSections);

        // Force a refresh by incrementing the key
        setRefreshKey(prev => prev + 1);
    };

    // Navigate to venue details
    const handleVenuePress = (venue: discoveryService.Venue) => {
        navigation.navigate('VenueDetails', { venue });
    };

    // Render section header for SectionList
    const renderSectionHeader = ({ section }: { section: VenueSection }) => (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
        </View>
    );

    // Render a venue item
    const renderVenueItem = ({ item }: { item: discoveryService.Venue }) => (
        <SafeVenueCard venue={item} onPress={handleVenuePress} />
    );

    // Make sure we're only showing SectionList for date ranges with multiple sections
    const shouldUseSectionList = isDateRange && venueSections.length > 1;

    return (
        <View style={styles.container}>
            {/* Venue type toggle */}
            <VenueToggle
                selectedType={venueType}
                onTypeChange={handleVenueTypeChange}
            />

            {/* Date selector component */}
            <DateSelector
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
            />

            {/* Live music first, with the genres underneath (ROADMAP section 5). Venues only:
                scraped club events have no such attribute. */}
            {venueType === 'bar' && (
                <View style={styles.liveRow}>
                    <TouchableOpacity
                        style={[styles.liveChip, liveMusicOnly && styles.liveChipOn]}
                        onPress={() => setLiveMusicOnly((on) => !on)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: liveMusicOnly }}
                        testID="live-music-filter"
                    >
                        <Ionicons
                            name="musical-notes-outline"
                            size={16}
                            color={liveMusicOnly ? colors.text : colors.textMuted}
                        />
                        <Text style={[styles.liveChipText, liveMusicOnly && styles.liveChipTextOn]}>
                            Live music only
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Genres chips/tags */}
            {genres.length > 0 && (
                <View style={styles.genreContainer}>
                    <Text style={styles.genresTitle}>Based on your music taste:</Text>
                    <View style={styles.genresList}>
                        {genres.slice(0, 5).map((genre, index) => (
                            <View key={index} style={styles.genreChip}>
                                <Text style={styles.genreText}>{genre}</Text>
                            </View>
                        ))}
                        {genres.length > 5 && (
                            <View style={styles.genreChip}>
                                <Text style={styles.genreText}>{`+${genres.length - 5} more`}</Text>
                            </View>
                        )}
                    </View>
                </View>
            )}

            {/* Venue list */}
            <View style={styles.list}>
                {!loading && loadFailed ? (
                    <View style={styles.loaderContainer}>
                        <LoadError onRetry={loadMatchingVenues} />
                    </View>
                ) : loading ? (
                    <View style={styles.loaderContainer}>
                        <ActivityIndicator
                            size="large"
                            color={venueType === 'bar' ? '#D35400' : '#6200EA'}
                        />
                        <Text style={styles.loadingText}>
                            {`Finding your perfect ${venueType}s ${isDateRange
                                ? `for ${new Date(dateRangeStart).toLocaleDateString('en-US', {
                                    month: 'short', day: 'numeric'
                                })} - ${new Date(dateRangeEnd).toLocaleDateString('en-US', {
                                    month: 'short', day: 'numeric'
                                })}`
                                : selectedDate === formatDate(today)
                                    ? 'for today'
                                    : `for ${new Date(selectedDate).toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric'
                                    })}`
                                }...`}
                        </Text>
                    </View>
                ) : shouldUseSectionList ? (
                    // Use SectionList for date ranges with multiple sections
                    <SectionList
                        key={`section-${venueType}-${refreshKey}`}
                        sections={venueSections}
                        keyExtractor={(item, index) => `${item.id || index}-${index}-${refreshKey}`}
                        renderItem={renderVenueItem}
                        renderSectionHeader={renderSectionHeader}
                        stickySectionHeadersEnabled={true}
                        contentContainerStyle={styles.venueList}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>
                                    {`No matching ${venueType}s found ${isDateRange
                                        ? `for ${new Date(dateRangeStart).toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric'
                                        })} - ${new Date(dateRangeEnd).toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric'
                                        })}`
                                        : selectedDate === formatDate(today)
                                            ? 'for today'
                                            : `for ${new Date(selectedDate).toLocaleDateString('en-US', {
                                                weekday: 'long',
                                                month: 'long',
                                                day: 'numeric'
                                            })}`
                                        }.`}
                                </Text>
                                <Text style={styles.emptySubtext}>
                                    Try selecting a different date or music genre.
                                </Text>
                                <TouchableOpacity
                                    style={styles.retryButton}
                                    onPress={() => setRefreshKey(prev => prev + 1)}
                                >
                                    <Text style={styles.retryText}>Retry</Text>
                                </TouchableOpacity>
                            </View>
                        }
                    />
                ) : (
                    // Use FlatList for single dates or when there's only one section
                    <FlatList
                        key={`flat-${venueType}-${refreshKey}`}
                        data={venues}
                        renderItem={renderVenueItem}
                        keyExtractor={(item, index) => `${item.id || index}-${index}-${refreshKey}`}
                        contentContainerStyle={styles.venueList}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>
                                    {`No matching ${venueType}s found ${isDateRange
                                        ? `for ${new Date(dateRangeStart).toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric'
                                        })} - ${new Date(dateRangeEnd).toLocaleDateString('en-US', {
                                            month: 'short', day: 'numeric'
                                        })}`
                                        : selectedDate === formatDate(today)
                                            ? 'for today'
                                            : `for ${new Date(selectedDate).toLocaleDateString('en-US', {
                                                weekday: 'long',
                                                month: 'long',
                                                day: 'numeric'
                                            })}`
                                        }.`}
                                </Text>
                                <Text style={styles.emptySubtext}>
                                    Try selecting a different date or music genre.
                                </Text>
                                <TouchableOpacity
                                    style={styles.retryButton}
                                    onPress={() => setRefreshKey(prev => prev + 1)}
                                >
                                    <Text style={styles.retryText}>Retry</Text>
                                </TouchableOpacity>
                            </View>
                        }
                    />
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    list: {
        flex: 1,
    },
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    liveRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    liveChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: colors.green,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    liveChipOn: {
        backgroundColor: colors.green,
    },
    liveChipText: {
        color: colors.textMuted,
        fontSize: 13,
    },
    liveChipTextOn: {
        color: colors.text,
        fontWeight: '600',
    },
    genreContainer: {
        padding: 15,
        backgroundColor: colors.surfaceDark,
    },
    genresTitle: {
        fontSize: 14,
        color: colors.text,
        marginBottom: 10,
    },
    genresList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    genreChip: {
        backgroundColor: colors.grey800,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
        marginBottom: 8,
    },
    genreText: {
        color: colors.text,
        fontSize: 12,
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    loadingText: {
        color: colors.textSecondary,
        marginTop: 10,
        fontSize: 16,
        textAlign: 'center',
    },
    venueList: {
        padding: 15,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 30,
    },
    emptyText: {
        color: colors.text,
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 10,
    },
    emptySubtext: {
        color: colors.textSecondary,
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
    },
    sectionHeader: {
        backgroundColor: colors.surfaceDark,
        padding: 10,
        borderRadius: 5,
        marginTop: 10,
        marginBottom: 5,
    },
    sectionHeaderText: {
        color: colors.text,
        fontWeight: 'bold',
        fontSize: 16,
    },
    retryButton: {
        backgroundColor: colors.primary,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
    },
    retryText: {
        color: colors.text,
        fontWeight: 'bold',
    },
});

export default TilkiScreen;
