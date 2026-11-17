/**
 * The venue side's navigation (KNOWN_ISSUES 86): bottom tabs in place of a row of four buttons
 * across the dashboard's header, which was cut off on a phone. Runs the real React Navigation
 * with stand-in screens, except the new Profile tab, which is the real one.
 */
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
import 'react-native-gesture-handler/jestSetup';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockLogout = jest.fn().mockResolvedValue(undefined);
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'bar-1' }, userType: 'bar', isLoading: false, logout: mockLogout }),
}));

// Stand-ins: each says which screen it is, and the artist picker which mode it was opened in
function mockScreen(name: string) {
  const { Text } = require('react-native');
  const Screen = ({ route }: { route?: { params?: { mode?: string } } }) => (
    <Text>{`screen:${name}${route?.params?.mode ? `:${route.params.mode}` : ''}`}</Text>
  );
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

beforeEach(async () => {
  mockLogout.mockClear();
  await AsyncStorage.clear();
  await AsyncStorage.multiSet([
    ['barName', 'Club Tilki'],
    ['barId', 'bar-1'],
  ]);
});

describe('venue bottom tabs', () => {
  it('opens on the dashboard with four tabs', async () => {
    renderVenueSide();
    expect(await screen.findByText('screen:BarHome')).toBeTruthy();
    for (const label of ['Dashboard', 'QR Codes', 'Artists', 'Profile']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('switches to QR codes and to the artist picker in venue mode', async () => {
    renderVenueSide();
    await screen.findByText('screen:BarHome');

    fireEvent.press(screen.getByText('QR Codes'));
    expect(await screen.findByText('screen:QRCodeGenerator')).toBeTruthy();

    fireEvent.press(screen.getByTestId('open-venue-artists'));
    expect(await screen.findByText('screen:ArtistPicker:venue')).toBeTruthy();
  });
});

describe('the Profile tab', () => {
  async function openProfile() {
    renderVenueSide();
    await screen.findByText('screen:BarHome');
    fireEvent.press(screen.getByText('Profile'));
    return screen.findByTestId('bar-profile-edit');
  }

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
