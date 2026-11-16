/**
 * Tilki shows "Try again" when the matching endpoints do not answer a list, instead of "No
 * matching bars found" (KNOWN_ISSUES 80; utils/venueResponse.ts).
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), setOptions: jest.fn() }),
  useRoute: () => ({ params: {} })
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', city: 'london' }, isBarManager: false })
}));
jest.mock('../../api/axiosClient', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  Accuracy: { Low: 2 }
}));

import axiosClient from '../../api/axiosClient';
import TilkiScreen from '../TilkiScreen';

const post = axiosClient.post as jest.Mock;

beforeEach(async () => {
  post.mockReset();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('userCity', 'london');
  await AsyncStorage.setItem('selected-genres', 'techno,house');
});

describe('TilkiScreen', () => {
  it.each([
    ['an object', { success: true }],
    ['null', null]
  ])('shows "Try again" when the server answers %s instead of a list', async (_label, body) => {
    post.mockResolvedValue({ data: body });
    const screen = render(<TilkiScreen />);
    await waitFor(() => expect(screen.getByTestId('load-error')).toBeTruthy());
    expect(screen.queryByText(/No matching/)).toBeNull();
  });

  it('shows "Try again" when the request fails, and recovers on retry', async () => {
    post.mockRejectedValue(new Error('Network request failed'));
    const screen = render(<TilkiScreen />);
    await waitFor(() => expect(screen.getByTestId('load-error')).toBeTruthy());

    post.mockResolvedValue({ data: [] });
    fireEvent.press(screen.getByTestId('load-error-retry'));
    await waitFor(() => expect(screen.queryByTestId('load-error')).toBeNull());
    await waitFor(() => expect(screen.getByText(/No matching/)).toBeTruthy());
  });

  it('shows "nothing found" for a real, empty list', async () => {
    post.mockResolvedValue({ data: [] });
    const screen = render(<TilkiScreen />);
    await waitFor(() => expect(screen.getByText(/No matching/)).toBeTruthy());
    expect(screen.queryByTestId('load-error')).toBeNull();
  });

  // In date-range mode every failed day was caught and counted as "no venues", so an outage
  // during "This Week" read as an empty week
  it('shows "Try again" when a day of a date range fails', async () => {
    post.mockResolvedValue({ data: [] });
    const screen = render(<TilkiScreen />);
    await waitFor(() => expect(screen.getByText(/No matching/)).toBeTruthy());

    let calls = 0;
    post.mockImplementation(() => {
      calls += 1;
      return calls === 3 ? Promise.reject(new Error('Network request failed')) : Promise.resolve({ data: [] });
    });
    // the date chips live in a modal behind the selector, which shows the current choice
    fireEvent.press(screen.getByText('Today'));
    fireEvent.press(screen.getByText('This Week'));

    await waitFor(() => expect(screen.getByTestId('load-error')).toBeTruthy());
    expect(calls).toBeGreaterThan(2);
  });
});
