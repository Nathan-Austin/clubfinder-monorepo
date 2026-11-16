/**
 * Proposes the city from where the phone is (KNOWN_ISSUES 67): once per app start, if location
 * is already allowed (this never asks for it), the covered city nearest the phone differs from
 * the account's, and the user has not said no to that city before.
 */
import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import { cityName, cityToPropose, nearestLiveCity } from '../constants/cities';
import { dismissProposal, wasProposalDismissed } from '../services/cityService';

let askedThisRun = false;

export function useCityProposal() {
  const { user, isBarManager, changeCity } = useAuth();

  useEffect(() => {
    if (askedThisRun || !user || isBarManager) return;
    askedThisRun = true;

    (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;
      const position =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
      const nearest = nearestLiveCity(position.coords)?.city;
      const offer = cityToPropose(user.city, nearest, nearest ? await wasProposalDismissed(nearest.slug) : false);
      if (!offer) return;

      const currentName = cityName(user.city) || 'your city';
      Alert.alert(
        `You seem to be in ${offer.name}`,
        `Show venues in ${offer.name} instead of ${currentName}? You can change this any time in your profile.`,
        [
          { text: `Keep ${currentName}`, style: 'cancel', onPress: () => dismissProposal(offer.slug) },
          {
            text: `Switch to ${offer.name}`,
            onPress: async () => {
              const result = await changeCity(offer.slug);
              if (!result.ok) Alert.alert('City not changed', result.message);
            }
          }
        ]
      );
    })().catch((error) => console.warn('City proposal skipped:', error));
  }, [user, isBarManager, changeCity]);
}
