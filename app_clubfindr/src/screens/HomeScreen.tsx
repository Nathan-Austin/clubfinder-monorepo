import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  TouchableWithoutFeedback
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MainTabParamList, RootStackParamList } from '../navigation';
import VenueCard from '../components/VenueCard';
import VenueToggle from '../components/VenueToggle';
import DistanceSelector from '../components/DistanceSelector';
import * as discoveryService from '../services/discoveryService';
import * as spotifyService from '../services/spotifyService';
import { useAuth } from '../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SpotifyAuthButton from '../components/SpotifyAuthButton';
import * as Location from 'expo-location';

type HomeScreenNavigationProp = StackNavigationProp<MainTabParamList & RootStackParamList, 'Home'>;

const HomeScreen = () => {
  const [venues, setVenues] = useState<discoveryService.Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentTracks, setRecentTracks] = useState<any[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [debugTapCount, setDebugTapCount] = useState(0);

  // New state for venue type toggle and distance filter
  const [venueType, setVenueType] = useState<'bar' | 'club'>('bar');
  const [distanceEnabled, setDistanceEnabled] = useState(false);
  const [maxDistance, setMaxDistance] = useState(2000); // 2km default

  const { isSpotifyConnected, spotifyAuth } = useAuth();
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const route = useRoute<RouteProp<MainTabParamList, 'Home'>>();
  // Load venues when component mounts or when venue type/distance settings change
  useEffect(() => {
    const testLocation = async () => {
      const result = await discoveryService.testLocationServices();
      console.log('Location test result:', result);
    };

    testLocation();

    if (isSpotifyConnected) {
      fetchRecentTracks();
    }

    if (route.params?.refresh) {
      // Check if we have matching venues stored
      const loadMatchingVenues = async () => {
        const matchingVenuesJson = await AsyncStorage.getItem(`matching-${venueType}s`);
        if (matchingVenuesJson) {
          try {
            const matchingVenues = JSON.parse(matchingVenuesJson);
            if (matchingVenues && Array.isArray(matchingVenues) && matchingVenues.length > 0) {
              // We have matching venues, use them
              setVenues(matchingVenues);
              setLoading(false);
              // Clear the stored venues after using them
              await AsyncStorage.removeItem(`matching-${venueType}s`);
              return;
            }
          } catch (error) {
            console.error('Error parsing matching venues:', error);
          }
        }

        // If we don't have matching venues or there was an error, fall back to regular fetch
        fetchVenues();
      };

      loadMatchingVenues();
    } else {
      // Regular venue loading
      fetchVenues();
    }
  }, [isSpotifyConnected, venueType, distanceEnabled, maxDistance, route.params?.refresh]);

  // Add this near the top of your HomeScreen component
  const testLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('Permission status:', status);

      if (status !== 'granted') {
        Alert.alert('Permission not granted', 'Location permission is required for distance filtering');
        return;
      }

      Alert.alert('Getting location...', 'Please wait');

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      Alert.alert(
        'Location found!',
        `Latitude: ${location.coords.latitude}\nLongitude: ${location.coords.longitude}`
      );
    } catch (error) {
      console.error('Location test error:', error);
      Alert.alert('Location Error', error instanceof Error ? error.message : 'Unknown error');
    }
  };
  const handleDebugTap = () => {
    setDebugTapCount(prev => {
      const newCount = prev + 1;
      if (newCount >= 5) {
        // Reset count
        setTimeout(() => setDebugTapCount(0), 1000);

        // Navigate to debug screen
        navigation.navigate('VenueCacheDebug');
        return 0;
      }
      return newCount;
    });
  };

  // Fetch venues based on the selected type and distance
  const fetchVenues = async () => {
    try {
      setLoading(true);

      // Get city from storage or use default
      const city = await AsyncStorage.getItem('userCity') || 'berlin';
      console.log(`Fetching ${venueType}s for city:`, city);

      // Use the cached version of the venue fetching functions
      let venueData: discoveryService.Venue[] = [];

      if (venueType === 'bar') {
        // Use the new cached function for bars
        venueData = await discoveryService.getNearbyVenuesWithCache(city, null, distanceEnabled ? maxDistance : undefined);
      } else {
        // Use the new cached function for clubs
        venueData = await discoveryService.getNearbyClubsWithCache(city, null, distanceEnabled ? maxDistance : undefined);
      }

      console.log(`Fetched ${venueData?.length || 0} ${venueType}s${distanceEnabled ? ' with distance filter' : ''}`);

      if (venueData && venueData.length > 0) {
        // Add additional logging to check venue data
        const venuesWithDistance = venueData.filter(v => v.distance !== undefined);
        console.log(`Venues with distance: ${venuesWithDistance.length}/${venueData.length}`);
        if (venuesWithDistance.length > 0) {
          console.log(`Distance range: ${Math.min(...venuesWithDistance.map(v => v.distance!))}m to ${Math.max(...venuesWithDistance.map(v => v.distance!))}m`);
        }

        setVenues(venueData.slice(0, 5)); // Just the first 5 for preview
      } else {
        // Use fallback data if API returns empty
        console.log(`Using fallback ${venueType} data`);
        const fallbackData = venueType === 'bar'
          ? discoveryService.getFallbackBars()
          : discoveryService.getFallbackClubs();
        setVenues(fallbackData.slice(0, 5));
      }
    } catch (error) {
      console.error(`Failed to fetch nearby ${venueType}s:`, error);
      // Use fallback data on error
      const fallbackData = venueType === 'bar'
        ? discoveryService.getFallbackBars()
        : discoveryService.getFallbackClubs();
      setVenues(fallbackData.slice(0, 5));
    } finally {
      setLoading(false);
    }
  };

  // Fetch user's recently played tracks from Spotify
  const fetchRecentTracks = async () => {
    if (!isSpotifyConnected) return;

    try {
      setLoadingTracks(true);
      const tracks = await spotifyService.getRecentlyPlayed(5);
      setRecentTracks(tracks);
    } catch (error) {
      console.error('Failed to fetch recent tracks:', error);
    } finally {
      setLoadingTracks(false);
    }
  };

  // Handle pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      // Force refresh the venue cache for the current venue type
      const city = await AsyncStorage.getItem('userCity') || 'berlin';
      await discoveryService.refreshVenueCache(city, venueType);

      // Then fetch venues again (will use the fresh cache)
      await fetchVenues();

      if (isSpotifyConnected) {
        await fetchRecentTracks();
      }
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }, [isSpotifyConnected, venueType, distanceEnabled, maxDistance]);

  // Navigate to venue details
  const handleVenuePress = (venue: discoveryService.Venue) => {
    navigation.navigate('VenueDetails', { venue });
  };

  // Handle venue type change
  const handleVenueTypeChange = (type: 'bar' | 'club') => {
    setVenueType(type);
  };

  // Handle distance filter enable/disable
  const handleDistanceEnableChange = (enabled: boolean) => {
    setDistanceEnabled(enabled);
  };

  // Handle distance change
  const handleDistanceChange = (distance: number) => {
    setMaxDistance(distance);
  };

  // Format the section title based on venue type and distance
  const getSectionTitle = () => {
    let title = `${venueType === 'bar' ? 'Bars' : 'Clubs'} in your area`;
    if (distanceEnabled) {
      const distanceText = maxDistance >= 1000
        ? `${(maxDistance / 1000).toFixed(1)}km`
        : `${maxDistance}m`;
      title += ` Within ${distanceText}`;
    }
    return title;
  };

  // Track component for recently played
  const TrackItem = ({ track }: { track: any }) => (
    <View style={styles.trackItem}>
      {track.albumImage ? (
        <View style={styles.trackImageContainer}>
          <Image
            source={{ uri: track.albumImage }}
            style={styles.trackImage}
          />
        </View>
      ) : (
        <View style={[styles.trackImageContainer, styles.noImage]} />
      )}
      <View style={styles.trackInfo}>
        <Text style={styles.trackName} numberOfLines={1}>{track.name}</Text>
        <Text style={styles.artistName} numberOfLines={1}>{track.artist}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >

      <View style={styles.section}>
        {/* Add the venue type toggle */}
        <VenueToggle
          selectedType={venueType}
          onTypeChange={handleVenueTypeChange}
        />
        {false && (
          <TouchableWithoutFeedback onPress={handleDebugTap}>
            <View style={styles.matchesContainer}>
              <Text style={styles.matchesText}>Tap 5 times to debug venue cache</Text>
            </View>
          </TouchableWithoutFeedback>)}

        {/* Add the distance selector */}
        <DistanceSelector
          distance={maxDistance}
          onDistanceChange={handleDistanceChange}
          enabled={distanceEnabled}
          onEnableChange={handleDistanceEnableChange}
        />


        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{getSectionTitle()}</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#D35400" style={styles.loader} />
        ) : venues.length > 0 ? (
          venues.map((venue) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              onPress={handleVenuePress}
            />
          ))
        ) : (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderText}>
              {distanceEnabled
                ? `No ${venueType}s found within ${maxDistance >= 1000 ? `${maxDistance / 1000}km` : `${maxDistance}m`}`
                : `No ${venueType}s found nearby`}
            </Text>
          </View>
        )}
      </View>

      {isSpotifyConnected && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Recent Tracks</Text>
            <TouchableOpacity onPress={fetchRecentTracks} disabled={loadingTracks}>
              <Text style={styles.viewAllText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {loadingTracks ? (
            <ActivityIndicator size="large" color="#D35400" style={styles.loader} />
          ) : recentTracks.length > 0 ? (
            <View style={[styles.tracksContainer, styles.section]}>
              {recentTracks.map((track, index) => (
                <TrackItem key={`${track.id}-${index}`} track={track} />
              ))}
            </View>
          ) : (
            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderText}>No recent tracks found</Text>
            </View>
          )}
        </View>
      )}


    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  trackImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  testButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  testButton: {
    backgroundColor: '#D35400',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginVertical: 10,
  },
  trackName: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  artistName: {
    fontSize: 14,
    color: 'white',
    opacity: 0.8,
  },
  trackImageContainer: {
    width: 50,
    height: 50,
    marginRight: 10,
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  noImage: {
    backgroundColor: '#2A2A2A',
  },
  header: {
    padding: 20,
    backgroundColor: '#D35400',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  section: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  viewAllText: {
    color: '#D35400',
    fontSize: 14,
  },
  loader: {
    marginVertical: 20,
  },
  placeholderCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 20,
    marginBottom: 10,
  },
  placeholderText: {
    color: '#FFFFFF',
    opacity: 0.6,
    textAlign: 'center',
  },
  matchesContainer: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
  },
  matchesText: {
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 15,
  },
  discoverButton: {
    backgroundColor: '#D35400',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    width: 200,
  },
  discoverButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  spotifyConnectContainer: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
  },
  spotifyConnectText: {
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 15,
  },
  spotifyButton: {
    backgroundColor: 'transparent',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D35400',
    width: 200,
  },
  spotifyButtonText: {
    color: '#D35400',
    fontWeight: 'bold',
  },
  tracksContainer: {
    marginTop: 10,
    backgroundColor: '#2A2A2A',
    color: 'white',
    borderRadius: 8,
    padding: 10,
  },
});

export default HomeScreen;
