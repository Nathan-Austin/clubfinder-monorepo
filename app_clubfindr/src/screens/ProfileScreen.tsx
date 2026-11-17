import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { tasteApi, USER_TASTE_BASE } from '../services/tasteService';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation';
import CitySection from '../components/CitySection';
import { colors } from '../theme';

type ProfileScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const ProfileScreen = () => {
  const { logout } = useAuth();
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The taste profile's genres (the artists picked in the app or on the web, and a Last.fm
  // import), which is what matching uses now that Spotify connect is retired
  useEffect(() => {
    fetchUserGenres();
  }, []);

  // Handle delete account button press with confirmation
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => navigation.navigate('DeleteAccount')
        }
      ],
      { cancelable: true }
    );
  };

  const fetchUserGenres = async () => {
    try {
      setLoading(true);
      const profile = await tasteApi(USER_TASTE_BASE).list();
      setGenres(profile.genres);
    } catch (error) {
      console.error('Failed to fetch user genres', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle pull-to-refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUserGenres();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <CitySection />


      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Music Preferences</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#D35400" style={styles.loader} />
        ) : genres.length > 0 ? (
          <View style={styles.genreContainer}>
            {genres.map((genre, index) => (
              <View key={index} style={styles.genreBadge}>
                <Text style={styles.genreText}>{genre}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noDataText}>
            No genres yet: pick a few artists you love below and their genres show up here.
          </Text>
        )}

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={fetchUserGenres}
          disabled={loading}
        >
          <Text style={styles.refreshButtonText}>Refresh Genres</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Artists</Text>
        <TouchableOpacity
          style={styles.scannerButton}
          onPress={() => navigation.navigate('ArtistPicker', { mode: 'profile' })}
          testID="open-artist-picker"
        >
          <Ionicons name="musical-notes-outline" size={24} color="#FFFFFF" />
          <Text style={styles.scannerButtonText}>Pick the artists you love</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Check-in</Text>
        <TouchableOpacity
          style={styles.scannerButton}
          onPress={() => navigation.navigate('QRScanner')}
        >
          <Ionicons name="qr-code-outline" size={24} color="#FFFFFF" />
          <Text style={styles.scannerButtonText}>Scan QR Code</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data & Privacy</Text>

        <TouchableOpacity
          style={styles.privacyItem}
          onPress={handleDeleteAccount}
        >
          <Text style={styles.privacyItemText}>Delete My Account and Data</Text>
          <Text style={styles.privacyItemWarning}>This action cannot be undone</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() => logout()}
      >
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

import { Ionicons } from '@expo/vector-icons';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 15,
  },
  loader: {
    marginVertical: 20,
  },
  noDataText: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: 20,
  },
  genreContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
  },
  genreBadge: {
    backgroundColor: colors.grey800,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  genreText: {
    color: colors.text,
    fontSize: 14,
  },
  refreshButton: {
    backgroundColor: colors.grey800,
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  privacyItem: {
    backgroundColor: colors.card,
    padding: 15,
    borderRadius: 5,
    marginBottom: 10,
  },
  privacyItemText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '500',
  },
  privacyItemWarning: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 5,
  },
  logoutButton: {
    margin: 20,
    backgroundColor: colors.danger,
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: colors.text,
    fontWeight: 'bold',
  },
  scannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 8,
    justifyContent: 'center',
    gap: 10,
  },
  scannerButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ProfileScreen;
