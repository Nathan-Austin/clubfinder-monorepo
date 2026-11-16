import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  geocodeAsync: jest.fn(),
  Accuracy: { Low: 2, Balanced: 3 }
}));

import { getCurrentLocation } from '../discoveryService';

const loc = Location as jest.Mocked<typeof Location>;
const dev = global as unknown as { __DEV__: boolean };

describe('getCurrentLocation without a position fix', () => {
  const wasDev = dev.__DEV__;
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('userCity', 'london');
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    loc.getCurrentPositionAsync.mockRejectedValue(new Error('no fix'));
    loc.getLastKnownPositionAsync.mockResolvedValue(null);
  });
  afterEach(() => {
    dev.__DEV__ = wasDev;
  });

  // It answered Berlin's coordinates, so a London user's distance filter dropped every venue
  it('gives a release build no position rather than Berlin', async () => {
    dev.__DEV__ = false;
    expect(await getCurrentLocation()).toBeNull();
  });

  it("stands a development build at the centre of the user's own city", async () => {
    dev.__DEV__ = true;
    expect(await getCurrentLocation()).toEqual({ latitude: 51.5074, longitude: -0.1278 });
  });

  it('uses a real fix when there is one', async () => {
    loc.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 48.85, longitude: 2.35 } } as never);
    expect(await getCurrentLocation()).toEqual({ latitude: 48.85, longitude: 2.35 });
  });
});

jest.mock('../../api/axiosClient', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), put: jest.fn() }
}));
import axiosClient from '../../api/axiosClient';
import { getVenues, VenuesUnavailableError } from '../discoveryService';

describe('getVenues when nothing can be loaded', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    (axiosClient.post as jest.Mock).mockRejectedValue(new Error('Network request failed'));
  });

  // It returned made-up Berlin venues ("Club XYZ, 123 Main St") in any city
  it.each(['bar', 'club'] as const)('throws for %ss instead of making venues up', async (type) => {
    await expect(getVenues('london', null, type)).rejects.toBeInstanceOf(VenuesUnavailableError);
  });

  it('still serves an expired cache when the network fails', async () => {
    const cached = [{ id: 'v1', name: 'Fabric', address: 'Charterhouse St', genres: [] }];
    await AsyncStorage.setItem('venue_data_cache', JSON.stringify(cached));
    await AsyncStorage.setItem('venue_cache_timestamp', '1');
    const venues = await getVenues('london', null, 'bar');
    expect(venues.map((v) => v.name)).toEqual(['Fabric']);
  });
});
