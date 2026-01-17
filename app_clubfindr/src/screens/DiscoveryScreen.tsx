import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    Alert
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MainTabParamList, RootStackParamList } from '../navigation';
import { useAuth } from '../contexts/AuthContext';
import * as spotifyService from '../services/spotifyService';
import * as discoveryService from '../services/discoveryService';
import SpotifyAuthButton from '../components/SpotifyAuthButton';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosClient from '../api/axiosClient';

type SpotifyItem = {
    id: string;
    name: string;
    image?: string;
    artists?: Array<{ id: string; name: string }>;
    selected: boolean;
    type: 'track' | 'playlist' | 'artist';
};

type DiscoverScreenRouteProp = RouteProp<MainTabParamList, 'Discover'>;
type DiscoveryScreenNavigationProp = StackNavigationProp<MainTabParamList & RootStackParamList, 'Discover'>;

const DiscoveryScreen = () => {
    const navigation = useNavigation<DiscoveryScreenNavigationProp>();
    const { isSpotifyConnected, spotifyAuth } = useAuth();
    const route = useRoute<DiscoverScreenRouteProp>();

    // State for the three categories of Spotify items
    const [recentTracks, setRecentTracks] = useState<SpotifyItem[]>([]);
    const [topArtists, setTopArtists] = useState<SpotifyItem[]>([]);
    const [playlists, setPlaylists] = useState<SpotifyItem[]>([]);

    // UI state
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'tracks' | 'artists' | 'playlists'>('playlists');

    // Selection state
    const [selectedItemsCount, setSelectedItemsCount] = useState(0);
    const [processingSelection, setProcessingSelection] = useState(false);

    useEffect(() => {
        // Load Spotify data when connected
        if (isSpotifyConnected) {
            fetchSpotifyData();
        }

        // Check for refresh parameter
        if (route.params?.refresh && route.params?.venueType && isSpotifyConnected) {
            console.log(`Refreshing with venue type: ${route.params.venueType}`);
            fetchMatchingVenues(route.params.venueType);
        }
    }, [isSpotifyConnected, route.params?.refresh, route.params?.venueType]);

    const fetchSpotifyData = async () => {
        try {
            setLoading(true);

            // Fetch user's top artists
            console.log("Fetching top artists...");
            const artists = await spotifyService.getTopArtists();
            const formattedArtists = artists.map(artist => ({
                id: artist.id,
                name: artist.name,
                image: artist.images?.[0]?.url,
                selected: false,
                type: 'artist' as const
            }));
            setTopArtists(formattedArtists);
            console.log(`Retrieved ${formattedArtists.length} top artists`);

            // Fetch user's recently played tracks
            console.log("Fetching recently played tracks...");
            const tracks = await spotifyService.getRecentlyPlayed(20);
            const formattedTracks = tracks.map(track => ({
                id: track.id,
                name: track.name,
                image: track.albumImage,
                artists: [{ id: '', name: track.artist }], // Simplified for display
                selected: false,
                type: 'track' as const
            }));
            setRecentTracks(formattedTracks);
            console.log(`Retrieved ${formattedTracks.length} recent tracks`);

            // Fetch user's playlists
            console.log("Fetching user playlists...");
            const userPlaylists = await spotifyService.getUserPlaylists();

            console.log(`Retrieved ${userPlaylists.length} playlists from Spotify`);

            // Add more logging to debug the playlists issue
            if (userPlaylists.length === 0) {
                console.log("No playlists returned from Spotify API");
            } else {
                console.log("First playlist:", JSON.stringify(userPlaylists[0]));
            }

            const formattedPlaylists = userPlaylists.map(playlist => ({
                id: playlist.id,
                name: playlist.name,
                image: playlist.images?.[0]?.url,
                selected: false,
                type: 'playlist' as const
            }));

            setPlaylists(formattedPlaylists);
            console.log(`Formatted ${formattedPlaylists.length} playlists for display`);
        } catch (error) {
            console.error('Error fetching Spotify data:', error);
            Alert.alert('Error', 'Failed to fetch your Spotify data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        if (isSpotifyConnected) {
            await fetchSpotifyData();
        }
        setRefreshing(false);
    }, [isSpotifyConnected]);

    const handleItemSelect = (id: string, type: 'track' | 'playlist' | 'artist') => {
        let updatedItems: SpotifyItem[] = [];
        let changedItem: SpotifyItem | undefined;

        switch (type) {
            case 'track':
                updatedItems = recentTracks.map(item => {
                    if (item.id === id) {
                        changedItem = { ...item, selected: !item.selected };
                        return changedItem;
                    }
                    return item;
                });
                setRecentTracks(updatedItems);
                break;
            case 'playlist':
                updatedItems = playlists.map(item => {
                    if (item.id === id) {
                        changedItem = { ...item, selected: !item.selected };
                        return changedItem;
                    }
                    return item;
                });
                setPlaylists(updatedItems);
                break;
            case 'artist':
                updatedItems = topArtists.map(item => {
                    if (item.id === id) {
                        changedItem = { ...item, selected: !item.selected };
                        return changedItem;
                    }
                    return item;
                });
                setTopArtists(updatedItems);
                break;
        }

        // Update the selected count based on all categories
        const newCount =
            recentTracks.filter(item => item.selected).length +
            playlists.filter(item => item.selected).length +
            topArtists.filter(item => item.selected).length +
            (changedItem?.selected ? 1 : -1);

        setSelectedItemsCount(newCount);
    };

    const getSelectedIds = (): string[] => {
        // Collect all selected IDs from all categories
        const selectedTrackIds = recentTracks
            .filter(track => track.selected)
            .map(track => track.id);

        const playlistIds = playlists
            .filter(playlist => playlist.selected)
            .map(playlist => playlist.id);

        const artistIds = topArtists
            .filter(artist => artist.selected)
            .map(artist => artist.id);

        // Combine and deduplicate IDs
        // If no IDs selected, return at least one ID to trigger the process
        const combinedIds = [...new Set([...selectedTrackIds, ...playlistIds, ...artistIds])];

        // If no IDs selected but user pressed the button, provide a fallback ID
        if (combinedIds.length === 0) {
            // Use a fallback ID - popular electronic artist as fallback (e.g. Daft Punk)
            return ["4tZwfgrHOc3mvqYlEYSvVi"];
        }

        return combinedIds;
    };

    const processSelectionForVenues = async (venueType: 'bar' | 'club') => {
        try {
            setProcessingSelection(true);

            // Get initially selected IDs (which include playlist IDs, not artist IDs)
            let initialSelectedIds = getSelectedIds();
            console.log(`Initial selection includes ${initialSelectedIds.length} IDs`);

            // Extract selected playlists
            const selectedPlaylists = playlists
                .filter(playlist => playlist.selected)
                .map(playlist => playlist.id);

            // Get actual artist IDs from selected playlists
            const artistIdsFromPlaylists: string[] = [];

            if (selectedPlaylists.length > 0) {
                console.log(`Fetching artist IDs from ${selectedPlaylists.length} selected playlists...`);

                // Process each selected playlist to get its tracks and extract artist IDs
                for (const playlistId of selectedPlaylists) {
                    try {
                        const tracks = await spotifyService.getPlaylistTracks(playlistId);

                        // Extract artist IDs from the tracks
                        tracks.forEach(track => {
                            if (track.artists && Array.isArray(track.artists)) {
                                track.artists.forEach(artist => {
                                    if (artist.id) {
                                        artistIdsFromPlaylists.push(artist.id);
                                    }
                                });
                            }
                        });
                    } catch (error) {
                        console.error(`Error fetching tracks for playlist ${playlistId}:`, error);
                    }
                }

                console.log(`Extracted ${artistIdsFromPlaylists.length} artist IDs from playlists`);
            }

            // Remove playlist IDs from the initial selection
            const nonPlaylistIds = initialSelectedIds.filter(id => !selectedPlaylists.includes(id));

            // Combine non-playlist IDs with artist IDs from playlists
            const finalSelectedIds = [...new Set([...nonPlaylistIds, ...artistIdsFromPlaylists])];

            console.log(`Processing ${finalSelectedIds.length} selected IDs for ${venueType} discovery`);

            // Process genres from the selection
            const genresResult = await spotifyService.processGenresFromSelection(finalSelectedIds);

            if (!genresResult.success) {
                console.error("Genre processing failed:", genresResult.message);
                throw new Error('Failed to process genres from selection');
            }

            console.log("Genres processed successfully:", genresResult.genresList);

            // Store the genres for later use
            await AsyncStorage.setItem('selected-genres', genresResult.genresList.join(','));

            // Get today's date in YYYY-MM-DD format
            const today = new Date().toISOString().split('T')[0];

            // Get city from storage or use default
            const city = await AsyncStorage.getItem('userCity') || 'berlin';

            // Fetch matching venues based on genres
            const endpoint = venueType === 'bar'
                ? '/api/mobile/bars/matching'
                : '/api/mobile/events/matching';

            try {
                const response = await axiosClient.post(endpoint, {
                    city,
                    date: today,
                    genres: genresResult.genresList
                });
                const matchingVenues = response.data;

                if (matchingVenues && Array.isArray(matchingVenues)) {
                    console.log(`Received ${matchingVenues.length} matching ${venueType}s`);

                    // Filter out duplicates before storing
                    const uniqueVenues = matchingVenues.filter((venue, index, self) =>
                        index === self.findIndex((v) => v.id === venue.id)
                    );
                    // Store the unique matching venues for Tilki screen
                    await AsyncStorage.setItem(`matching-${venueType}s`, JSON.stringify(uniqueVenues));

                    // Navigate to the Tilki tab to show matches
                    navigation.navigate('Tilki');

                    // Optional - display a confirmation message
                    Alert.alert(
                        "Matches Found!",
                        `We found ${matchingVenues.length} ${venueType}s that match your music taste.`,
                        [{ text: "OK" }]
                    );
                } else {
                    console.log(`No matching ${venueType}s found or invalid response`);

                    // Navigate to Tilki anyway, it will show empty state
                    navigation.navigate('Tilki');
                }
            } catch (error) {
                console.error(`Error fetching matching ${venueType}s:`, error);
                Alert.alert(
                    "Error",
                    `Could not find matching ${venueType}s. Please try again.`,
                    [{ text: "OK" }]
                );
            }
        } catch (error) {
            console.error('Error processing selection:', error);
            Alert.alert('Error', 'Failed to process your selection. Please try again.');
        } finally {
            setProcessingSelection(false);
        }
    };
    const fetchMatchingVenues = async (venueType: 'bar' | 'club') => {
        try {
            const genres = await AsyncStorage.getItem('selected-genres');
            if (!genres) return;

            const genresList = genres.split(',');
            const city = await AsyncStorage.getItem('userCity') || 'berlin';
            const today = new Date().toISOString().split('T')[0];

            console.log(`Fetching matching ${venueType}s with genres`, genresList);

            const endpoint = venueType === 'bar'
                ? '/api/mobile/bars/matching'
                : '/api/mobile/events/matching';

            const response = await axiosClient.post(endpoint, {
                city,
                date: today,
                genres: genresList
            });
            const venues = response.data;

            if (venues && Array.isArray(venues)) {
                console.log(`Fetched ${venues.length} matching venues`);
            }
            // Do something with the venues data
        } catch (error) {
            console.error(`Error fetching matching ${venueType}s:`, error);
        }
    };

    // Render item for FlatList
    const renderItem = ({ item }: { item: SpotifyItem }) => (
        <TouchableOpacity
            style={[styles.item, item.selected && styles.selectedItem]}
            onPress={() => handleItemSelect(item.id, item.type)}
        >
            {item.image ? (
                <Image source={{ uri: item.image }} style={styles.itemImage} />
            ) : (
                <View style={[styles.itemImage, styles.placeholderImage]} />
            )}
            <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                {item.artists && item.artists[0] && (
                    <Text style={styles.itemSubtext} numberOfLines={1}>
                        {item.artists[0].name}
                    </Text>
                )}
                {item.type === 'playlist' && (
                    <Text style={styles.itemSubtext}>Playlist</Text>
                )}
            </View>
            <View style={styles.selectionIndicator}>
                {item.selected && <Text style={styles.checkmark}>✓</Text>}
            </View>
        </TouchableOpacity>
    );

    // If not connected to Spotify, show the connect prompt
    if (!isSpotifyConnected) {
        return (
            <View style={styles.container}>
                <View style={styles.spotifyConnectContainer}>
                    <Image
                        source={require('../../assets/Spotify_Primary_Logo_RGB_Green.png')}
                        style={styles.spotifyLogo}
                        resizeMode="contain"
                    />
                    <Text style={styles.headerTitle}>
                        Connect with Spotify to discover venues that match your music taste
                    </Text>
                    <Text style={styles.spotifyConnectText}>
                        Sign in with your Spotify account to find venues playing music you'll love.
                        We'll use your listening history and preferences to find the perfect match.
                    </Text>
                    <SpotifyAuthButton
                        onSuccess={fetchSpotifyData}
                        style={styles.spotifyAuthButton}
                    />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Tab selector */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'playlists' && styles.activeTab]}
                    onPress={() => setActiveTab('playlists')}
                >
                    <Text style={[styles.tabText, activeTab === 'playlists' && styles.activeTabText]}>
                        Playlists
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'artists' && styles.activeTab]}
                    onPress={() => setActiveTab('artists')}
                >
                    <Text style={[styles.tabText, activeTab === 'artists' && styles.activeTabText]}>
                        Top Artists
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'tracks' && styles.activeTab]}
                    onPress={() => setActiveTab('tracks')}
                >
                    <Text style={[styles.tabText, activeTab === 'tracks' && styles.activeTabText]}>
                        Recent Tracks
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Content area */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#D35400" />
                    <Text style={styles.loadingText}>Loading your Spotify data...</Text>
                </View>
            ) : (
                <FlatList
                    data={activeTab === 'playlists' ? playlists : (activeTab === 'artists' ? topArtists : recentTracks)}
                    renderItem={renderItem}
                    keyExtractor={item => `${item.type}-${item.id}`}
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>
                                {activeTab === 'playlists'
                                    ? "You don't have any playlists yet."
                                    : (activeTab === 'artists'
                                        ? "We couldn't find your top artists."
                                        : "No recently played tracks found.")}
                            </Text>
                            <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
                                <Text style={styles.retryText}>Refresh</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}

            {/* Bottom action bar for finding venues */}
            <View style={styles.actionBar}>
                <Text style={styles.selectedCount}>{selectedItemsCount > 0 ? `${selectedItemsCount} selected` : 'Find venues with your music taste'}</Text>
                <View style={styles.actionButtons}>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.findBarsButton]}
                        onPress={() => processSelectionForVenues('bar')}
                        disabled={processingSelection}
                    >
                        {processingSelection ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <Text style={styles.actionButtonText}>Find Bars</Text>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.findClubsButton]}
                        onPress={() => processSelectionForVenues('club')}
                        disabled={processingSelection}
                    >
                        {processingSelection ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <Text style={styles.actionButtonText}>Find Clubs</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    header: {
        padding: 20,
        backgroundColor: '#D35400',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 5,
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#FFFFFF',
        opacity: 0.8,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#222222',
        padding: 5,
        marginHorizontal: 20,
        marginTop: 15,
        borderRadius: 25,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
    },
    tab: {
        flex: 1,
        padding: 10,
        alignItems: 'center',
        borderRadius: 20,
    },
    activeTab: {
        backgroundColor: '#D35400',
    },
    tabText: {
        color: '#CCCCCC',
        fontWeight: '500',
    },
    activeTabText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    list: {
        flex: 1,
    },
    listContent: {
        padding: 16,
    },
    item: {
        flexDirection: 'row',
        padding: 12,
        marginBottom: 8,
        backgroundColor: '#2A2A2A',
        borderRadius: 8,
        alignItems: 'center',
    },
    selectedItem: {
        backgroundColor: 'rgba(29, 185, 84, 0.2)', // Light green background for selected items
        borderWidth: 1,
        borderColor: '#D35400',
    },
    itemImage: {
        width: 60,
        height: 60,
        borderRadius: 4,
        marginRight: 12,
    },
    placeholderImage: {
        backgroundColor: '#3E3E3E',
    },
    itemInfo: {
        flex: 1,
    },
    itemName: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
        marginBottom: 4,
    },
    itemSubtext: {
        color: '#CCCCCC',
        fontSize: 14,
    },
    selectionIndicator: {
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkmark: {
        color: '#D35400',
        fontSize: 18,
        fontWeight: 'bold',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#FFFFFF',
        marginTop: 10,
    },
    emptyContainer: {
        padding: 20,
        alignItems: 'center',
    },
    emptyText: {
        color: '#CCCCCC',
        textAlign: 'center',
        marginBottom: 10,
    },
    retryButton: {
        padding: 10,
        backgroundColor: '#333333',
        borderRadius: 5,
    },
    retryText: {
        color: '#D35400',
        fontWeight: 'bold',
    },
    actionBar: {
        backgroundColor: '#2A2A2A',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#333333',
    },
    selectedCount: {
        color: '#FFFFFF',
        fontSize: 14,
        marginBottom: 10,
    },
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    actionButton: {
        flex: 1,
        padding: 12,
        borderRadius: 5,
        alignItems: 'center',
        marginHorizontal: 5,
    },
    findBarsButton: {
        backgroundColor: '#D35400', // Theme color
    },
    findClubsButton: {
        backgroundColor: '#6200EA', // Purple for clubs
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    spotifyConnectContainer: {
        flex: 1,
        padding: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    spotifyLogo: {
        width: 120,
        height: 120,
        marginBottom: 20,
    },
    spotifyConnectText: {
        color: '#FFFFFF',
        textAlign: 'center',
        marginVertical: 20,
        lineHeight: 22,
    },
    spotifyAuthButton: {
        width: '90%',
    }
});

export default DiscoveryScreen;
