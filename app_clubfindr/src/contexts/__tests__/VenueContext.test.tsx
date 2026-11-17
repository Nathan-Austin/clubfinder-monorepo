import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { VenueProvider, useVenue } from '../VenueContext';

function Shows({ label }: { label: string }) {
  const { barId, barName } = useVenue();
  return <Text>{`${label}:${barId ?? 'none'}:${barName}`}</Text>;
}

function Renames() {
  const { setBarName } = useVenue();
  return (
    <TouchableOpacity onPress={() => setBarName('Club Tilki Two')}>
      <Text>rename</Text>
    </TouchableOpacity>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('gives every venue screen the id and name stored at login, before they render', async () => {
  await AsyncStorage.multiSet([
    ['barId', 'bar-1'],
    ['barName', 'Club Tilki'],
  ]);
  render(
    <VenueProvider>
      <Shows label="a" />
    </VenueProvider>
  );
  // The screens never see a half-loaded venue: nothing renders until both are read
  expect(screen.queryByText(/^a:/)).toBeNull();
  expect(await screen.findByText('a:bar-1:Club Tilki')).toBeTruthy();
});

it('a new name reaches every screen at once, and storage', async () => {
  await AsyncStorage.multiSet([
    ['barId', 'bar-1'],
    ['barName', 'Club Tilki'],
  ]);
  render(
    <VenueProvider>
      <Shows label="dashboard" />
      <Shows label="profile" />
      <Renames />
    </VenueProvider>
  );
  await screen.findByText('dashboard:bar-1:Club Tilki');

  await act(async () => {
    fireEvent.press(screen.getByText('rename'));
  });

  expect(screen.getByText('dashboard:bar-1:Club Tilki Two')).toBeTruthy();
  expect(screen.getByText('profile:bar-1:Club Tilki Two')).toBeTruthy();
  expect(await AsyncStorage.getItem('barName')).toBe('Club Tilki Two');
});

it('reports no venue when the login stored none', async () => {
  render(
    <VenueProvider>
      <Shows label="a" />
    </VenueProvider>
  );
  expect(await screen.findByText('a:none:')).toBeTruthy();
});

it('is only for the venue side', () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() => render(<Shows label="a" />)).toThrow('useVenue must be used within a VenueProvider');
  error.mockRestore();
});
