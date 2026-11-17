import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MainTabParamList, RootStackParamList } from '../navigation';
import VenueCard from '../components/VenueCard';
import VenueToggle from '../components/VenueToggle';
import DistanceSelector from '../components/DistanceSelector';
import * as discoveryService from '../services/discoveryService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cityForQueries } from '../services/cityService';
import { useAuth } from '../contexts/AuthContext';
import { useCityProposal } from '../hooks/useCityProposal';
import { cityName } from '../constants/cities';
import LoadError from '../components/LoadError';
import { log } from '../utils/logger';

type HomeScreenNavigationProp = StackNavigationProp<MainTabParamList & RootStackParamList, 'Home'>;

const HomeScreen = () => {
  const [venues, setVenues] = useState<discoveryService.Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // New state for venue type toggle and distance filter
  const [venueType, setVenueType] = useState<'bar' | 'club'>('bar');
  const [distanceEnabled, setDistanceEnabled] = useState(false);
  const [maxDistance, setMaxDistance] = useState(2000); // 2km default

  const navigation = useNavigation<HomeScreenNavigationProp>();
  const route = useRoute<RouteProp<MainTabParamList, 'Home'>>();
  const { user } = useAuth();
  // "You seem to be in Paris": offers the city the phone is in (KNOWN_ISSUES 67)
  useCityProposal();
  // Load venues when component mounts or when venue type/distance settings change
  useEffect(() => {
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
  // user?.city: a city changed in Profile or by the proposal reloads the list, no new login
  }, [venueType, distanceEnabled, maxDistance, route.params?.refresh, user?.city]);

  // Fetch venues based on the selected type and distance
  const fetchVenues = async () => {
    try {
      setLoading(true);
      setLoadFailed(false);

            const city = await cityForQueries();
      log.debug(`Fetching ${venueType}s for city:`, city);

      // Use the cached version of the venue fetching functions
      let venueData: discoveryService.Venue[] = [];

      if (venueType === 'bar') {
        // Use the new cached function for bars
        venueData = await discoveryService.getNearbyVenuesWithCache(city, null, distanceEnabled ? maxDistance : undefined);
      } else {
        // Use the new cached function for clubs
        venueData = await discoveryService.getNearbyClubsWithCache(city, null, distanceEnabled ? maxDistance : undefined);
      }

      log.debug(`Fetched ${venueData?.length || 0} ${venueType}s${distanceEnabled ? ' with distance filter' : ''}`);

      if (venueData && venueData.length > 0) {
        setVenues(venueData.slice(0, 5)); // Just the first 5 for preview
      } else {
        // A real answer with nothing in it: the "No bars found" card, not made-up venues
        setVenues([]);
      }
    } catch (error) {
      console.error(`Failed to fetch nearby ${venueType}s:`, error);
      setVenues([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  // Handle pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      // Force refresh the venue cache for the current venue type
      const city = await cityForQueries();
      await discoveryService.refreshVenueCache(city, venueType);

      // Then fetch venues again (will use the fresh cache)
      await fetchVenues();
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }, [venueType, distanceEnabled, maxDistance]);

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
    const place = cityName(user?.city) || 'your area';
    let title = `${venueType === 'bar' ? 'Bars' : 'Clubs'} in ${place}`;
    if (distanceEnabled) {
      const distanceText = maxDistance >= 1000
        ? `${(maxDistance / 1000).toFixed(1)}km`
        : `${maxDistance}m`;
      title += ` Within ${distanceText}`;
    }
    return title;
  };

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
        ) : loadFailed ? (
          <LoadError onRetry={fetchVenues} />
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



    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
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
});

export default HomeScreen;
