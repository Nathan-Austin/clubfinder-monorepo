/**
 * "Your city" on the Profile tab (KNOWN_ISSUES 67): shows the account's city, proposes the one
 * the phone is in, and lets the user pick any covered city. Saving changes the account
 * (PUT /api/account/city) and the screens follow without a new login.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import { LIVE_CITIES, cityName, findLiveCity, nearestLiveCity } from '../constants/cities';
import { colors } from '../theme';

const CitySection = () => {
  const { user, changeCity } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState('');
  const current = findLiveCity(user?.city)?.slug ?? null;

  const choose = async (slug: string) => {
    if (slug === current || saving) return;
    setSaving(slug);
    setNote('');
    const result = await changeCity(slug);
    setSaving(null);
    if (!result.ok) {
      Alert.alert('City not changed', result.message);
    } else if (!result.synced) {
      // A server from before 2026-11-16 (see services/cityService.ts)
      setNote('Saved on this phone. Your account follows once the server is updated.');
    }
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location off', 'Allow location for Tilki, or pick your city below.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const nearest = nearestLiveCity(position.coords);
      if (!nearest) {
        Alert.alert('No city nearby', "We don't cover a city near you yet. Pick one below.");
      } else if (nearest.city.slug === current) {
        Alert.alert(nearest.city.name, `You're already set to ${nearest.city.name}.`);
      } else {
        Alert.alert(`You seem to be in ${nearest.city.name}`, `Switch your city to ${nearest.city.name}?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Switch', onPress: () => choose(nearest.city.slug) }
        ]);
      }
    } catch (error) {
      console.warn('Could not get a location:', error);
      Alert.alert('No location', 'Could not find where you are. Pick your city below.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={styles.section} testID="city-section">
      <Text style={styles.title}>Your City</Text>
      <Text style={styles.current}>
        {current ? `Showing venues in ${cityName(current)}` : 'Choose the city to show venues for'}
      </Text>

      <TouchableOpacity style={styles.locate} onPress={useMyLocation} disabled={locating} testID="city-use-location">
        {locating ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Ionicons name="locate-outline" size={20} color="#FFFFFF" />
        )}
        <Text style={styles.locateText}>Use my location</Text>
      </TouchableOpacity>

      <View style={styles.cities}>
        {LIVE_CITIES.map((city) => {
          const selected = city.slug === current;
          return (
            <TouchableOpacity
              key={city.slug}
              style={[styles.city, selected && styles.citySelected]}
              onPress={() => choose(city.slug)}
              disabled={!!saving}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              testID={`city-${city.slug}`}
            >
              {saving === city.slug ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={[styles.cityText, selected && styles.cityTextSelected]}>{city.name}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 6 },
  current: { color: colors.textSecondary, marginBottom: 12 },
  locate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12
  },
  locateText: { color: colors.text, fontWeight: 'bold' },
  cities: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  city: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.grey800,
    minWidth: 70,
    alignItems: 'center'
  },
  citySelected: { backgroundColor: colors.primary },
  cityText: { color: colors.text },
  cityTextSelected: { fontWeight: 'bold' },
  note: { color: colors.textSecondary, fontSize: 12, marginTop: 10 }
});

export default CitySection;
