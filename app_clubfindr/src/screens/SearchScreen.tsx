import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Image,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
    Alert
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { CompositeNavigationProp } from '@react-navigation/native';
import { MainTabParamList, RootStackParamList } from '../navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosClient from '../api/axiosClient';

// Import genre data
import genreData from '../constants/unified-genres.json';

// Define proper types for the search results
export interface Artist {
    id: string;
    name: string;
    genres: string[];
    images: Array<{
        url: string;
        height?: number;
        width?: number;
    }>;
    popularity?: number;
    external_urls?: {
        spotify: string;
    };
}

export interface Track {
    id: string;
    name: string;
    artists: Array<{
        id: string;
        name: string;
        external_urls?: {
            spotify: string;
        };
    }>;
    album: {
        id: string;
        name: string;
        images: Array<{
            url: string;
            height?: number;
            width?: number;
        }>;
        external_urls?: {
            spotify: string;
        };
    };
    preview_url?: string;
    uri?: string;
    external_urls?: {
        spotify: string;
    };
}

export interface SearchResults {
    artists: Artist[];
    tracks: Track[];
}

// Define token storage key
const SPOTIFY_ACCESS_TOKEN = 'spotify_access_token';

// Define the navigation prop type
type SearchScreenNavigationProp = CompositeNavigationProp<
    StackNavigationProp<RootStackParamList>,
    StackNavigationProp<MainTabParamList>
>;

const SearchScreen = () => {
    const navigation = useNavigation<SearchScreenNavigationProp>();

    // State for genre selection
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedSubgenre, setSelectedSubgenre] = useState<string | null>(null);
    const [selectedSubSubgenre, setSelectedSubSubgenre] = useState<string | null>(null);
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

    // State for search functionality
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'artists' | 'tracks'>('artists');
    const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());
    const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
    const [processingSelection, setProcessingSelection] = useState(false);

    // Get auth context
    const { user } = useAuth();

    // Handle toggling selection for artists
    const toggleArtistSelection = (artistId: string) => {
        setSelectedArtists(prev => {
            const newSet = new Set(prev);
            if (newSet.has(artistId)) {
                newSet.delete(artistId);
            } else {
                newSet.add(artistId);
            }
            return newSet;
        });
    };

    // Handle toggling selection for tracks
    const toggleTrackSelection = (trackId: string) => {
        setSelectedTracks(prev => {
            const newSet = new Set(prev);
            if (newSet.has(trackId)) {
                newSet.delete(trackId);
            } else {
                newSet.add(trackId);
            }
            return newSet;
        });
    };

    // Clear all selections
    const clearSelections = () => {
        // Clear selected genres
        setSelectedGenres([]);

        // Clear selected artists and tracks
        setSelectedArtists(new Set());
        setSelectedTracks(new Set());

        // Show confirmation to user
        Alert.alert('Selections Cleared', 'All selections have been cleared.');
    };

    // Extract genres from selected items
    const getSelectedGenres = (): string[] => {
        const genres = new Set<string>();

        if (!searchResults) return [];

        // Add genres from selected artists
        searchResults.artists
            .filter(artist => selectedArtists.has(artist.id))
            .forEach(artist => {
                if (artist.genres && Array.isArray(artist.genres)) {
                    artist.genres.forEach(genre => genres.add(genre));
                }
            });

        // Add genres from artists of selected tracks
        searchResults.tracks
            .filter(track => selectedTracks.has(track.id))
            .forEach(track => {
                track.artists.forEach(artist => {
                    const artistData = searchResults.artists.find(a => a.id === artist.id);
                    if (artistData && artistData.genres) {
                        artistData.genres.forEach(genre => genres.add(genre));
                    }
                });
            });

        return Array.from(genres);
    };

    // New function to fetch venues based on genres
    const fetchVenuesWithGenres = async (genres: string[]): Promise<void> => {
        try {
            // Get today's date in YYYY-MM-DD format
            const today = new Date().toISOString().split('T')[0];

            // Get city from storage or use default
            const city = await AsyncStorage.getItem('userCity') || 'berlin';

            console.log('Fetching venues with genres:', genres);

            // Fetch both bars and clubs simultaneously
            const [barsResponse, clubsResponse] = await Promise.all([
                axiosClient.post('/api/mobile/bars/matching', {
                    city,
                    date: today,
                    genres: genres
                }),
                axiosClient.post('/api/mobile/events/matching', {
                    city,
                    date: today,
                    genres: genres
                })
            ]);

            // Process and store bars
            if (barsResponse.data && Array.isArray(barsResponse.data)) {
                console.log(`Found ${barsResponse.data.length} matching bars`);
                const uniqueBars = barsResponse.data.filter((bar, index, self) =>
                    index === self.findIndex(b => b.id === bar.id)
                );
                await AsyncStorage.setItem('matching-bars', JSON.stringify(uniqueBars));
            } else {
                console.log('No matching bars found or invalid response');
                await AsyncStorage.removeItem('matching-bars');
            }

            // Process and store clubs
            if (clubsResponse.data && Array.isArray(clubsResponse.data)) {
                console.log(`Found ${clubsResponse.data.length} matching clubs`);
                const uniqueClubs = clubsResponse.data.filter((club, index, self) =>
                    index === self.findIndex(c => c.id === club.id)
                );
                await AsyncStorage.setItem('matching-clubs', JSON.stringify(uniqueClubs));
            } else {
                console.log('No matching clubs found or invalid response');
                await AsyncStorage.removeItem('matching-clubs');
            }

        } catch (error) {
            console.error('Error fetching venues:', error);
            throw error;
        }
    };

    // Process selection and navigate to venue page
    const processSelectionForVenues = async () => {
        try {
            setProcessingSelection(true);

            // Get selected genres
            const selectedGenres = getSelectedGenres();

            // Validate selection
            if (selectedGenres.length === 0) {
                Alert.alert('No Genres', 'Please select at least one artist or track to find venues.');
                return;
            }

            // Store the genres for later use
            await AsyncStorage.setItem('selected-genres', selectedGenres.join(','));

            // Fetch both bars and clubs
            await fetchVenuesWithGenres(selectedGenres);

            // Navigate to Tilki tab
            navigation.navigate('Main', { screen: 'Tilki' });
        } catch (error) {
            console.error('Error processing selection:', error);
            Alert.alert('Error', 'Failed to process your selection. Please try again.');
        } finally {
            setProcessingSelection(false);
        }
    };

    // Handle genre selection
    const toggleGenreSelection = (genre: string) => {
        setSelectedGenres(prev =>
            prev.includes(genre)
                ? prev.filter(g => g !== genre)
                : [...prev, genre]
        );
    };

    // Reset selection states
    const handleBack = () => {
        if (selectedSubSubgenre) {
            setSelectedSubSubgenre(null);
        } else if (selectedSubgenre) {
            setSelectedSubgenre(null);
        } else if (selectedCategory) {
            setSelectedCategory(null);
        }
    };

    // Handle Spotify search
    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        if (!user) {
            setError('Please log in to search');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const accessToken = await AsyncStorage.getItem(SPOTIFY_ACCESS_TOKEN);
            if (!accessToken) {
                setError('Spotify access token not found. Please reconnect your Spotify account.');
                setIsLoading(false);
                return;
            }

            console.log('Searching Spotify for:', searchQuery);

            // Use POST request with JSON body instead of GET with query parameters
            const response = await axiosClient.post('/api/mobile/spotify/search', {
                q: searchQuery,
                userId: user.id,
                access_token: accessToken
            });
            const data = response.data as {
                success: boolean;
                data?: SearchResults;
                message?: string;
            };

            if (data && data.success && data.data) {
                console.log(`Found ${data.data.artists.length} artists and ${data.data.tracks.length} tracks`);
                setSearchResults(data.data);
            } else {
                setError(data.message || 'Search failed. Please try again.');
            }
        } catch (error) {
            console.error('Search error:', error);
            setError('An error occurred while searching. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Render genre selection UI based on current state
    const renderGenreSelection = () => {
        if (selectedSubSubgenre) {
            const category = genreData.categories.find(c => c.name === selectedCategory);
            const subgenre = category?.subgenres.find(s => s.name === selectedSubgenre);
            const subsubgenre = subgenre?.subsubgenres?.find(ss => ss.name === selectedSubSubgenre);

            return (
                <View>
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <Text style={styles.backButtonText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerText}>{subsubgenre?.name}</Text>
                    <ScrollView>
                        {subsubgenre?.genres.map(genre => (
                            <TouchableOpacity
                                key={genre}
                                style={[
                                    styles.genreItem,
                                    selectedGenres.includes(genre) && styles.selectedGenre
                                ]}
                                onPress={() => toggleGenreSelection(genre)}
                            >
                                <Text style={styles.genreText}>{genre}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            );
        }

        if (selectedSubgenre) {
            const category = genreData.categories.find(c => c.name === selectedCategory);
            const subgenre = category?.subgenres.find(s => s.name === selectedSubgenre);

            return (
                <View>
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <Text style={styles.backButtonText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerText}>{subgenre?.name}</Text>
                    <ScrollView>
                        {subgenre?.subsubgenres?.map(subsubgenre => (
                            <TouchableOpacity
                                key={subsubgenre.name}
                                style={styles.genreItem}
                                onPress={() => setSelectedSubSubgenre(subsubgenre.name)}
                            >
                                <Text style={styles.genreText}>{subsubgenre.name} →</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            );
        }

        if (selectedCategory) {
            const category = genreData.categories.find(c => c.name === selectedCategory);

            return (
                <View>
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <Text style={styles.backButtonText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerText}>{category?.name}</Text>
                    <ScrollView>
                        {category?.subgenres.map(subgenre => (
                            <TouchableOpacity
                                key={subgenre.name}
                                style={styles.genreItem}
                                onPress={() => setSelectedSubgenre(subgenre.name)}
                            >
                                <Text style={styles.genreText}>{subgenre.name} →</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            );
        }

        return (
            <ScrollView>
                {genreData.categories.map(category => (
                    <TouchableOpacity
                        key={category.name}
                        style={styles.genreItem}
                        onPress={() => setSelectedCategory(category.name)}
                    >
                        <Text style={styles.genreText}>{category.name} →</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        );
    };

    // Handle finding venues with selected genres
    const handleFindVenues = async () => {
        if (selectedGenres.length === 0) {
            Alert.alert('Selection Required', 'Please select at least one genre to find venues.');
            return;
        }

        try {
            setProcessingSelection(true);

            // Store the genres for later use
            await AsyncStorage.setItem('selected-genres', selectedGenres.join(','));

            // Fetch both bars and clubs with the selected genres
            await fetchVenuesWithGenres(selectedGenres);

            // Navigate to Tilki tab
            navigation.navigate('Tilki');
        } catch (error) {
            console.error('Error storing genres:', error);
            Alert.alert('Error', 'Failed to process your genre selection.');
        } finally {
            setProcessingSelection(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.container}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.innerContainer}>
                    <View style={styles.searchSection}>
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search for tracks or artists..."
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onSubmitEditing={handleSearch}
                        />
                        <TouchableOpacity
                            style={styles.searchButton}
                            onPress={handleSearch}
                            disabled={isLoading}
                        >
                            <Text style={styles.buttonText}>Search</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Selected Genres Display with Clear Button */}
                    {selectedGenres.length > 0 && (
                        <View style={styles.selectedGenresContainer}>
                            <View style={styles.selectedGenresHeader}>
                                <Text style={styles.selectedGenresTitle}>
                                    Selected Genres ({selectedGenres.length})
                                </Text>
                                <TouchableOpacity
                                    style={styles.clearButton}
                                    onPress={clearSelections}
                                >
                                    <Text style={styles.clearButtonText}>Clear All</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                {selectedGenres.map(genre => (
                                    <TouchableOpacity
                                        key={genre}
                                        style={styles.selectedGenreTag}
                                        onPress={() => toggleGenreSelection(genre)}
                                    >
                                        <Text style={styles.selectedGenreText}>{genre} ×</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                            <TouchableOpacity
                                style={[
                                    styles.findVenuesButton,
                                    processingSelection && styles.disabledButton
                                ]}
                                onPress={handleFindVenues}
                                disabled={processingSelection}
                            >
                                {processingSelection ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.findVenuesText}>Find Matching Venues</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Genre Selection or Search Results */}
                    <View style={styles.contentContainer}>
                        {/* Error Message */}
                        {error && (
                            <TouchableOpacity
                                style={styles.errorContainer}
                                onPress={() => setError(null)}
                            >
                                <View style={styles.errorContent}>
                                    <Text style={styles.errorText}>{error}</Text>
                                    <Text style={styles.dismissText}>Tap to dismiss</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.retryButton}
                                    onPress={(e) => {
                                        e.stopPropagation(); // Prevent dismissing error when clicking retry
                                        handleSearch();
                                    }}
                                >
                                    <Text style={styles.retryText}>Retry</Text>
                                </TouchableOpacity>
                            </TouchableOpacity>
                        )}

                        {/* Loading Indicator */}
                        {isLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#D35400" />
                                <Text style={styles.loadingText}>Searching...</Text>
                            </View>
                        ) : searchQuery && searchResults ? (
                            <View style={styles.searchResultsContainer}>
                                {/* Tab Navigation with Clear Button */}
                                <View style={styles.searchResultsHeader}>
                                    <View style={styles.tabContainer}>
                                        <TouchableOpacity
                                            style={[styles.tab, viewMode === 'artists' && styles.activeTab]}
                                            onPress={() => setViewMode('artists')}
                                        >
                                            <Text style={[styles.tabText, viewMode === 'artists' && styles.activeTabText]}>
                                                Artists ({selectedArtists.size})
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.tab, viewMode === 'tracks' && styles.activeTab]}
                                            onPress={() => setViewMode('tracks')}
                                        >
                                            <Text style={[styles.tabText, viewMode === 'tracks' && styles.activeTabText]}>
                                                Tracks ({selectedTracks.size})
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                    {(selectedArtists.size > 0 || selectedTracks.size > 0) && (
                                        <TouchableOpacity
                                            style={styles.clearButtonSmall}
                                            onPress={clearSelections}
                                        >
                                            <Text style={styles.clearButtonText}>Clear</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                <ScrollView style={styles.searchResultsList}>
                                    {viewMode === 'artists' ? (
                                        // Artists List
                                        searchResults.artists.length > 0 ? (
                                            searchResults.artists.map((artist) => (
                                                <TouchableOpacity
                                                    key={artist.id}
                                                    style={[
                                                        styles.searchResultItem,
                                                        selectedArtists.has(artist.id) && styles.selectedItem
                                                    ]}
                                                    onPress={() => toggleArtistSelection(artist.id)}
                                                >
                                                    {artist.images[0] && (
                                                        <Image
                                                            source={{ uri: artist.images[0].url }}
                                                            style={styles.artistImage}
                                                        />
                                                    )}
                                                    <View style={styles.resultTextContainer}>
                                                        <Text style={styles.resultTitle}>{artist.name}</Text>
                                                        {artist.genres.length > 0 && (
                                                            <Text style={styles.resultSubtext}>
                                                                {artist.genres.slice(0, 3).join(', ')}
                                                            </Text>
                                                        )}
                                                    </View>
                                                    {selectedArtists.has(artist.id) && (
                                                        <Text style={styles.checkmark}>✓</Text>
                                                    )}
                                                </TouchableOpacity>
                                            ))
                                        ) : (
                                            <Text style={styles.emptyText}>No artists found</Text>
                                        )
                                    ) : (
                                        // Tracks List
                                        searchResults.tracks.length > 0 ? (
                                            searchResults.tracks.map((track) => (
                                                <TouchableOpacity
                                                    key={track.id}
                                                    style={[
                                                        styles.searchResultItem,
                                                        selectedTracks.has(track.id) && styles.selectedItem
                                                    ]}
                                                    onPress={() => toggleTrackSelection(track.id)}
                                                >
                                                    {track.album.images[0] && (
                                                        <Image
                                                            source={{ uri: track.album.images[0].url }}
                                                            style={styles.trackImage}
                                                        />
                                                    )}
                                                    <View style={styles.resultTextContainer}>
                                                        <Text style={styles.resultTitle}>{track.name}</Text>
                                                        <Text style={styles.resultSubtext}>
                                                            {track.artists.map(a => a.name).join(', ')}
                                                        </Text>
                                                        <Text style={styles.albumText}>{track.album.name}</Text>
                                                    </View>
                                                    {selectedTracks.has(track.id) && (
                                                        <Text style={styles.checkmark}>✓</Text>
                                                    )}
                                                </TouchableOpacity>
                                            ))
                                        ) : (
                                            <Text style={styles.emptyText}>No tracks found</Text>
                                        )
                                    )}
                                </ScrollView>

                                {/* Action Button */}
                                {(selectedArtists.size > 0 || selectedTracks.size > 0) && (
                                    <View style={styles.actionBar}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, processingSelection && styles.disabledButton]}
                                            onPress={processSelectionForVenues}
                                            disabled={processingSelection}
                                        >
                                            {processingSelection ? (
                                                <ActivityIndicator size="small" color="#FFFFFF" />
                                            ) : (
                                                <Text style={styles.actionButtonText}>
                                                    Find Venues ({selectedArtists.size + selectedTracks.size} items selected)
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        ) : (
                            renderGenreSelection()
                        )}
                    </View>
                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    searchResultsContainer: {
        flex: 1,
    },
    searchResultsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#222222',
        padding: 5,
        borderRadius: 25,
        flex: 1,
        marginRight: 10,
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
    searchResultsList: {
        flex: 1,
    },
    selectedItem: {
        backgroundColor: 'rgba(29, 185, 84, 0.2)',
        borderWidth: 1,
        borderColor: '#D35400',
    },
    checkmark: {
        color: '#D35400',
        fontSize: 22,
        fontWeight: 'bold',
        marginLeft: 10,
    },
    emptyText: {
        color: '#CCCCCC',
        textAlign: 'center',
        padding: 20,
        fontSize: 16,
    },
    actionBar: {
        backgroundColor: '#2A2A2A',
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#333333',
    },
    actionButton: {
        backgroundColor: '#D35400',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    disabledButton: {
        backgroundColor: '#555555',
        opacity: 0.5,
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    innerContainer: {
        flex: 1,
        padding: 16,
    },
    selectedGenresHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    selectedGenresTitle: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: 'bold',
    },
    clearButton: {
        backgroundColor: '#333333',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
    },
    clearButtonSmall: {
        backgroundColor: '#333333',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 4,
    },
    clearButtonText: {
        color: '#FF5252',
        fontSize: 12,
        fontWeight: '500',
    },
    findVenuesButton: {
        backgroundColor: '#1DB954',
        padding: 12,
        borderRadius: 8,
        marginTop: 12,
        alignItems: 'center',
    },
    findVenuesText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    errorContainer: {
        padding: 16,
        backgroundColor: 'rgba(255, 82, 82, 0.2)',
        marginBottom: 16,
        borderRadius: 8,
    },
    errorContent: {
        marginBottom: 8,
    },
    errorText: {
        color: '#ff8a80',
        textAlign: 'center',
        marginBottom: 4,
    },
    dismissText: {
        color: '#cccccc',
        fontSize: 12,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    retryButton: {
        backgroundColor: '#1DB954',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 4,
        alignSelf: 'center',
    },
    retryText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    loadingText: {
        marginTop: 8,
        color: '#cccccc',
    },
    sectionHeader: {
        fontSize: 18,
        fontWeight: 'bold',
        padding: 16,
        backgroundColor: '#333333',
        color: '#ffffff',
    },
    artistImage: {
        width: 50,
        height: 50,
        borderRadius: 25,
        marginRight: 12,
    },
    trackImage: {
        width: 50,
        height: 50,
        marginRight: 12,
    },
    resultTextContainer: {
        flex: 1,
    },
    resultTitle: {
        fontSize: 16,
        fontWeight: '500',
        color: '#ffffff',
    },
    resultSubtext: {
        fontSize: 14,
        color: '#b3b3b3',
        marginTop: 2,
    },
    albumText: {
        fontSize: 12,
        color: '#808080',
        marginTop: 2,
    },
    searchSection: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    searchInput: {
        flex: 1,
        height: 40,
        borderWidth: 1,
        borderColor: '#333333',
        borderRadius: 8,
        paddingHorizontal: 12,
        marginRight: 8,
        backgroundColor: '#2a2a2a',
        color: '#ffffff',
    },
    searchButton: {
        backgroundColor: '#D35400',
        paddingHorizontal: 16,
        justifyContent: 'center',
        borderRadius: 8,
    },
    buttonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    selectedGenreTag: {
        backgroundColor: '#D35400',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
        marginBottom: 8,
    },
    selectedGenreText: {
        color: '#fff',
    },
    contentContainer: {
        flex: 1,
    },
    backButton: {
        paddingVertical: 8,
    },
    backButtonText: {
        color: '#D35400',
        fontSize: 16,
    },
    headerText: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#ffffff',
    },
    genreItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333333', // Darker border
    },
    selectedGenre: {
        backgroundColor: 'rgba(29, 185, 84, 0.2)', // Transparent Spotify green
    },
    genreText: {
        fontSize: 16,
        color: '#ffffff',
    },
    searchResultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333333', // Darker border
    },
    resultText: {
        fontSize: 16,
        color: '#ffffff',
    },
});

export default SearchScreen;