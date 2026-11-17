/**
 * The venue side's navigation (KNOWN_ISSUES 86): bottom tabs in place of a row of four buttons
 * across the dashboard's header, which was cut off on a phone. Runs the real React Navigation
 * with stand-in screens, except the new Profile tab, which is the real one.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockLogout = jest.fn().mockResolvedValue(undefined);
// The server, by URL: the venue's events and its declared genres
let mockEvents: unknown = [];
const mockGet = jest.fn((url: string) => {
  if (url === '/api/mobile/bars/bar-1/events') {
    return mockEvents instanceof Error ? Promise.reject(mockEvents) : Promise.resolve({ data: { events: mockEvents } });
  }
  if (url.endsWith('/taste/genres')) return Promise.resolve({ data: { genres: ['techno'] } });
  return Promise.resolve({ data: {} });
});
const mockDelete = jest.fn().mockResolvedValue({ data: { message: 'Event deleted successfully' } });
jest.mock('../../api/axiosClient', () => ({
  __esModule: true,
  default: { get: (url: string) => mockGet(url), put: jest.fn(), delete: (url: string) => mockDelete(url) },
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'bar-1' }, userType: 'bar', isLoading: false, logout: mockLogout }),
}));

// Stand-ins: each says which screen it is, and the artist picker which mode it was opened in.
// They read the route with useRoute(), as the real picker does: inside the Music tab it is
// rendered as a child, not as a screen, and gets its mode from the tab's route that way
function mockScreen(name: string) {
  const { Text } = require('react-native');
  const { useRoute } = require('@react-navigation/native');
  const Screen = () => {
    const mode = (useRoute() as { params?: { mode?: string } }).params?.mode;
    return <Text>{`screen:${name}${mode ? `:${mode}` : ''}`}</Text>;
  };
  return { __esModule: true, default: Screen };
}
jest.mock('../../screens/HomeScreen', () => mockScreen('Home'));
jest.mock('../../screens/LoginScreen', () => mockScreen('Login'));
jest.mock('../../screens/ProfileScreen', () => mockScreen('Profile'));
jest.mock('../../screens/DiscoveryScreen', () => mockScreen('Discovery'));
jest.mock('../../screens/TilkiScreen', () => mockScreen('Tilki'));
jest.mock('../../screens/VenueDetailsScreen', () => mockScreen('VenueDetails'));
jest.mock('../../screens/SignupScreen', () => mockScreen('Signup'));
jest.mock('../../screens/DeleteAccountScreen', () => mockScreen('DeleteAccount'));
jest.mock('../../screens/SearchScreen', () => mockScreen('Search'));
jest.mock('../../screens/EmailVerificationScreen', () => mockScreen('EmailVerification'));
jest.mock('../../screens/PrivacyPolicyScreen', () => mockScreen('PrivacyPolicy'));
jest.mock('../../screens/TermsScreen', () => mockScreen('Terms'));
jest.mock('../../screens/BarRegistrationScreen', () => mockScreen('BarRegistration'));
jest.mock('../../screens/BarConfirmationScreen', () => mockScreen('BarConfirmation'));
jest.mock('../../screens/BarHomeScreen', () => mockScreen('BarHome'));
jest.mock('../../screens/EditBarProfileScreen', () => mockScreen('EditBarProfile'));
jest.mock('../../screens/EventFormScreen', () => mockScreen('EventForm'));
jest.mock('../../screens/QRCodeGeneratorScreen', () => mockScreen('QRCodeGenerator'));
jest.mock('../../screens/QRScannerScreen', () => mockScreen('QRScanner'));
jest.mock('../../screens/ArtistPickerScreen', () => mockScreen('ArtistPicker'));

import { BarNavigator } from '../index';
import { colors, navigationTheme } from '../../theme';

function renderVenueSide() {
  return render(
    <NavigationContainer theme={navigationTheme}>
      <BarNavigator />
    </NavigationContainer>
  );
}

const FRIDAY = {
  id: 'ev-1',
  theme_name: 'Friday Session',
  event_date: '2099-12-04',
  start_time: '22:00:00',
  end_time: null,
  recurring: false,
  special_genres: ['house'],
};

beforeEach(async () => {
  mockLogout.mockClear();
  mockDelete.mockClear();
  mockEvents = [];
  await AsyncStorage.clear();
  await AsyncStorage.multiSet([
    ['barName', 'Club Tilki'],
    ['barId', 'bar-1'],
  ]);
});

describe('venue bottom tabs', () => {
  it('opens on Overview, with Overview, Events, Music and Venue', async () => {
    renderVenueSide();
    expect(await screen.findByText('screen:BarHome')).toBeTruthy();
    for (const label of ['Overview', 'Events', 'Music', 'Venue']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // QR codes are not a tab any more: they open from Venue and the Overview
    expect(screen.queryByText('QR Codes')).toBeNull();
  });

  it('switches to Music with the artist picker in venue mode', async () => {
    renderVenueSide();
    await screen.findByText('screen:BarHome');
    fireEvent.press(screen.getByTestId('open-venue-music'));
    expect(await screen.findByText('screen:ArtistPicker:venue')).toBeTruthy();
  });

  it("Music's Genres part loads the genres the venue plays", async () => {
    renderVenueSide();
    await screen.findByText('screen:BarHome');
    fireEvent.press(screen.getByTestId('open-venue-music'));
    fireEvent.press(await screen.findByTestId('venue-music-genres'));
    expect(await screen.findByText('techno')).toBeTruthy();
    expect(screen.queryByText('screen:ArtistPicker:venue')).toBeNull();
  });
});

describe('the Events tab', () => {
  async function openEvents() {
    renderVenueSide();
    await screen.findByText('screen:BarHome');
    fireEvent.press(screen.getByTestId('open-venue-events'));
  }

  it("lists the venue's events and opens Edit over the tabs", async () => {
    mockEvents = [FRIDAY];
    await openEvents();
    expect(await screen.findByText('Friday Session')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Edit Friday Session'));
    expect(await screen.findByText('screen:EventForm')).toBeTruthy();
  });

  it('says when there are none, and opens Create', async () => {
    await openEvents();
    expect(await screen.findByTestId('venue-events-empty')).toBeTruthy();
    fireEvent.press(screen.getByTestId('add-event'));
    expect(await screen.findByText('screen:EventForm')).toBeTruthy();
  });

  it('shows "Try again" when the events cannot be loaded, not "no events"', async () => {
    mockEvents = new Error('Network request failed');
    await openEvents();
    expect(await screen.findByText("We couldn't load your events just now.")).toBeTruthy();
    expect(screen.queryByTestId('venue-events-empty')).toBeNull();
    mockEvents = [FRIDAY];
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Friday Session')).toBeTruthy();
  });

  it('deletes an event after a confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockEvents = [FRIDAY];
    await openEvents();
    fireEvent.press(await screen.findByLabelText('Delete Friday Session'));
    expect(mockDelete).not.toHaveBeenCalled();

    mockEvents = [];
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((button) => button.text === 'Delete')!.onPress!();
    });
    expect(mockDelete).toHaveBeenCalledWith('/api/mobile/bars/bar-1/events/ev-1');
    await waitFor(() => expect(screen.queryByText('Friday Session')).toBeNull());
    alert.mockRestore();
  });
});

describe('the Venue tab', () => {
  async function openProfile() {
    renderVenueSide();
    await screen.findByText('screen:BarHome');
    fireEvent.press(screen.getByTestId('open-venue-settings'));
    return screen.findByTestId('bar-profile-edit');
  }

  it('opens the QR codes over the tabs', async () => {
    await openProfile();
    fireEvent.press(screen.getByTestId('bar-profile-qr'));
    expect(await screen.findByText('screen:QRCodeGenerator')).toBeTruthy();
  });

  it("shows the venue's name", async () => {
    await openProfile();
    expect(await screen.findByText('Club Tilki')).toBeTruthy();
  });

  it('opens Edit venue profile over the tabs', async () => {
    fireEvent.press(await openProfile());
    expect(await screen.findByText('screen:EditBarProfile')).toBeTruthy();
  });

  it('logs out after a confirmation, and forgets the venue', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await openProfile();
    fireEvent.press(screen.getByTestId('bar-profile-logout'));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
    await buttons.find((button) => button.text === 'Log Out')!.onPress!();

    expect(mockLogout).toHaveBeenCalledTimes(1);
    await waitFor(async () => {
      expect(await AsyncStorage.getItem('barId')).toBeNull();
      expect(await AsyncStorage.getItem('barName')).toBeNull();
    });
    alert.mockRestore();
  });
});

describe('the dark theme', () => {
  it('is dark and built from the palette the screens use', () => {
    expect(navigationTheme.dark).toBe(true);
    expect(navigationTheme.colors.background).toBe(colors.background);
    expect(navigationTheme.colors.card).toBe(colors.background);
    expect(navigationTheme.colors.primary).toBe(colors.primary);
  });
});
