import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Switch,
  Alert,
  RefreshControl
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import * as spotifyService from '../services/spotifyService';
import SpotifyAuthButton from '../components/SpotifyAuthButton';
import * as mobileSpotifyService from '../services/mobileSpotifyService';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation';

type ProfileScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const ProfileScreen = () => {
  const { user, logout, isSpotifyConnected, spotifyAuth } = useAuth();
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Fetch user genres on component mount or when Spotify is connected
  useEffect(() => {
    if (isSpotifyConnected) {
      fetchUserGenres();
    }
  }, [isSpotifyConnected]);

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

  // Fetch user's top genres from Spotify
  const fetchUserGenres = async () => {
    if (!isSpotifyConnected) return;

    try {
      setLoading(true);
      const genreData = await spotifyService.getUserGenres();
      setGenres(genreData);
    } catch (error) {
      console.error('Failed to fetch user genres', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle pull-to-refresh
  const onRefresh = async () => {
    setRefreshing(true);
    if (isSpotifyConnected) {
      await fetchUserGenres();
    }
    setRefreshing(false);
  };

  // Toggle notifications
  const toggleNotifications = () => {
    setNotificationsEnabled(!notificationsEnabled);
    // In a real app, you'd update user preferences in storage
  };

  // Run Spotify integration test
  const handleSpotifyTest = async () => {
    try {
      setLoading(true);
      const testResults = await spotifyService.testSpotifyIntegration();

      // Format results for alert
      const resultMessage = Object.entries(testResults)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      Alert.alert('Spotify Integration Test', resultMessage);
    } catch (error) {
      Alert.alert(
        'Spotify Test Error',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Settings</Text>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Push Notifications</Text>
          <Switch
            trackColor={{ false: '#767577', true: '#D35400' }}
            thumbColor={notificationsEnabled ? '#ffffff' : '#f4f3f4'}
            onValueChange={toggleNotifications}
            value={notificationsEnabled}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Music Preferences</Text>

        {isSpotifyConnected ? (
          <>
            <View style={styles.connectedStatus}>
              <Text style={styles.connectedText}>✓ Connected to Spotify</Text>
              <SpotifyAuthButton
                disconnectEnabled
                disconnectText="Disconnect"
                style={styles.disconnectButton}
                textStyle={styles.disconnectText}
                showIcon={false}
              />
            </View>

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
              <Text style={styles.noDataText}>No genre data available</Text>
            )}

            <TouchableOpacity
              style={styles.refreshButton}
              onPress={fetchUserGenres}
              disabled={loading}
            >
              <Text style={styles.refreshButtonText}>Refresh Genres</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.spotifyConnectContainer}>
            <Text style={styles.spotifyConnectText}>
              Connect with Spotify to find venues that match your music taste!
            </Text>
            <SpotifyAuthButton onSuccess={fetchUserGenres} />
          </View>
        )}
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
    backgroundColor: '#121212',
  },
  header: {
    padding: 20,
    backgroundColor: '#D35400',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  email: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  city: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.7,
    marginTop: 5,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 15,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  settingLabel: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  connectedStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  connectedText: {
    color: '#D35400',
    fontSize: 16,
  },
  disconnectButton: {
    marginVertical: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#FF5252',
  },
  disconnectText: {
    color: '#FF5252',
    fontSize: 14,
  },
  loader: {
    marginVertical: 20,
  },
  noDataText: {
    color: '#CCCCCC',
    textAlign: 'center',
    marginVertical: 20,
  },
  genreContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
  },
  genreBadge: {
    backgroundColor: '#333333',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  genreText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  refreshButton: {
    backgroundColor: '#333333',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#D35400',
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
  privacyItem: {
    backgroundColor: '#2A2A2A',
    padding: 15,
    borderRadius: 5,
    marginBottom: 10,
  },
  privacyItemText: {
    color: '#FF5252',
    fontSize: 16,
    fontWeight: '500',
  },
  privacyItemWarning: {
    color: '#CCCCCC',
    fontSize: 12,
    marginTop: 5,
  },
  debugButton: {
    backgroundColor: '#D35400',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
  },
  debugButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  logoutButton: {
    margin: 20,
    backgroundColor: '#FF5252',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  scannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D35400',
    padding: 15,
    borderRadius: 8,
    justifyContent: 'center',
    gap: 10,
  },
  scannerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ProfileScreen;
