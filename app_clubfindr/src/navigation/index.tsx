import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer, type NavigatorScreenParams } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { ActivityIndicator, View } from 'react-native';

// Import screens
import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import ProfileScreen from '../screens/ProfileScreen';
import DiscoveryScreen from '../screens/DiscoveryScreen';
import TilkiScreen from '../screens/TilkiScreen';
import VenueDetailsScreen from '../screens/VenueDetailsScreen';
import SignupScreen from '../screens/SignupScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import SearchScreen from '../screens/SearchScreen';
import EmailVerificationScreen from '../screens/EmailVerificationScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import TermsScreen from '../screens/TermsScreen';
import BarRegistrationScreen from '../screens/BarRegistrationScreen';
import BarConfirmationScreen from '../screens/BarConfirmationScreen';
import { Venue } from '../services/discoveryService';
import BarHomeScreen from '../screens/BarHomeScreen';
import EditBarProfileScreen from '../screens/EditBarProfileScreen';
import EventFormScreen from '../screens/EventFormScreen';
import QRCodeGeneratorScreen from '../screens/QRCodeGeneratorScreen';
import QRScannerScreen from '../screens/QRScannerScreen';
import ArtistPickerScreen, { type ArtistPickerParams } from '../screens/ArtistPickerScreen';
import BarProfileScreen from '../screens/BarProfileScreen';
import VenueMusicScreen from '../screens/VenueMusicScreen';
import { colors, headerOptions, navigationTheme, tabBarOptions } from '../theme';
import { VenueProvider } from '../contexts/VenueContext';

// Define the types for the various navigators
export type MainTabParamList = {
  Home: { refresh?: boolean };
  Profile: undefined;
  Discover: { venueType?: 'bar' | 'club'; refresh?: boolean };
  Search: undefined;
  Tilki: { venueType?: 'bar' | 'club'; refreshKey?: number };
  BarManager: undefined;
};
export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  /** The tab navigator; navigate('Main', { screen, params }) targets a tab */
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  EmailVerification: { email: string };
  VenueDetails: { venue: Venue };
  Terms: undefined;
  PrivacyPolicy: undefined;
  DeleteAccount: undefined;
  BarRegistration: undefined;
  BarConfirmation: { email: string };
  BarDashboard: undefined;
  BarManager: undefined;
  QRScanner: undefined;
  /** Artist picker step after login, in place of the tabs (see RootNavigator) */
  ArtistOnboarding: ArtistPickerParams;
  /** The same picker from the Profile tab */
  ArtistPicker: ArtistPickerParams;
};

/**
 * The venue side (KNOWN_ISSUES 86): bottom tabs like the customer side, in place of a row of four
 * buttons across the dashboard's header that was cut off on a phone. The forms open over the tabs.
 */
export type BarTabParamList = {
  /** Stats and the venue's events */
  BarHome: undefined;
  QRCodeGenerator: undefined;
  /** Artists and genres you play; the artist picker inside reads `mode` from these params */
  VenueMusic: ArtistPickerParams;
  /** Edit the venue profile, log out */
  BarProfile: undefined;
};
export type BarStackParamList = {
  BarTabs: NavigatorScreenParams<BarTabParamList> | undefined;
  EditBarProfile: undefined;
  AddEvent: undefined;
  EditEvent: { event: unknown };
};


type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Create navigators
const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

// Main Tab Navigator (bottom tabs inside the app)
const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string = '';

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'Discover') {
            iconName = focused ? 'musical-notes' : 'musical-notes-outline';
          } else if (route.name === 'Search') {
            iconName = focused ? 'search' : 'search-outline';
          } else if (route.name === 'Tilki') {
            iconName = focused ? 'paw' : 'paw-outline';
          }

          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
        ...tabBarOptions,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Nearby Venues' }} />
      <Tab.Screen name="Discover" component={DiscoveryScreen} options={{ title: 'Find Your Vibe' }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Search' }} />
      <Tab.Screen name="Tilki" component={TilkiScreen} options={{ title: 'Tilki' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'My Profile' }} />
    </Tab.Navigator>
  );
};
const BarTab = createBottomTabNavigator<BarTabParamList>();
const BarStack = createStackNavigator<BarStackParamList>();

const BAR_TAB_ICONS: Record<keyof BarTabParamList, [focused: IconName, unfocused: IconName]> = {
  BarHome: ['stats-chart', 'stats-chart-outline'],
  QRCodeGenerator: ['qr-code', 'qr-code-outline'],
  VenueMusic: ['musical-notes', 'musical-notes-outline'],
  BarProfile: ['business', 'business-outline'],
};

export const BarTabNavigator = () => (
  <BarTab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => (
        <Ionicons name={BAR_TAB_ICONS[route.name][focused ? 0 : 1]} size={size} color={color} />
      ),
      ...tabBarOptions,
    })}
  >
    <BarTab.Screen
      name="BarHome"
      component={BarHomeScreen}
      options={{ title: 'Dashboard', tabBarLabel: 'Dashboard' }}
    />
    <BarTab.Screen
      name="QRCodeGenerator"
      component={QRCodeGeneratorScreen}
      options={{ title: 'QR Code Management', tabBarLabel: 'QR Codes' }}
    />
    <BarTab.Screen
      name="VenueMusic"
      component={VenueMusicScreen}
      initialParams={{ mode: 'venue' }}
      options={{ title: 'Your Music', tabBarLabel: 'Music', tabBarButtonTestID: 'open-venue-music' }}
    />
    <BarTab.Screen
      name="BarProfile"
      component={BarProfileScreen}
      options={{ title: 'Venue Profile', tabBarLabel: 'Profile' }}
    />
  </BarTab.Navigator>
);

// VenueProvider: every venue screen reads the venue's id and name from it (useVenue)
export const BarNavigator = () => (
  <VenueProvider>
    <BarStack.Navigator screenOptions={headerOptions}>
      <BarStack.Screen name="BarTabs" component={BarTabNavigator} options={{ headerShown: false }} />
      <BarStack.Screen
        name="EditBarProfile"
        component={EditBarProfileScreen}
        options={{ title: 'Edit Bar Profile' }}
      />
      <BarStack.Screen
        name="AddEvent"
        component={EventFormScreen}
        options={{ title: 'Create Event' }}
      />
      <BarStack.Screen
        name="EditEvent"
        component={EventFormScreen}
        options={{ title: 'Edit Event' }}
      />
    </BarStack.Navigator>
  </VenueProvider>
);

// Main App Navigator (single level, simplified structure)
const RootNavigator = () => {
  const { user, isLoading, userType } = useAuth();
  const isBarManager = userType === 'bar';
  // The server says so at login (user.artistOnboarding), until finished or skipped on this device
  const needsArtistOnboarding = !isBarManager && user?.artistOnboarding?.required === true;
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={headerOptions}>
        {!user ? (
          // Auth screens
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Signup"
              component={SignupScreen}
              options={{ title: 'Create Account' }}
            />
            <Stack.Screen
              name="BarRegistration"
              component={BarRegistrationScreen}
              options={{ title: 'Register Your Bar' }}
            />
            <Stack.Screen
              name="BarConfirmation"
              component={BarConfirmationScreen}
              options={{ title: 'Confirm Registration' }}
            />
            <Stack.Screen
              name="EmailVerification"
              component={EmailVerificationScreen}
              options={{
                title: 'Verify Email',
                headerLeft: () => null,
                gestureEnabled: false
              }}
            />
          </>
        ) : isBarManager ? (
          // Bar manager screens
          <Stack.Screen
            name="BarManager"
            component={BarNavigator}
            options={{ headerShown: false }}
          />
        ) : needsArtistOnboarding ? (
          // Artist picker step first: Continue or Skip calls finishArtistOnboarding, which clears
          // the flag and brings in the tabs below
          <Stack.Screen
            name="ArtistOnboarding"
            component={ArtistPickerScreen}
            initialParams={{ mode: 'onboarding' }}
            options={{ title: 'Your Artists', headerLeft: () => null, gestureEnabled: false }}
          />
        ) : (
          // Main app screens - just show the tab navigator directly
          <Stack.Screen
            name="Main"
            component={MainTabNavigator}
            options={{ headerShown: false }}
          />
        )}

        {/* Modal screens accessible from anywhere */}
        <Stack.Group screenOptions={{ presentation: 'modal' }}>
          <Stack.Screen
            name="Terms"
            component={TermsScreen}
            options={{ title: 'Terms and Conditions' }}
          />
          <Stack.Screen
            name="PrivacyPolicy"
            component={PrivacyPolicyScreen}
            options={{ title: 'Privacy Policy' }}
          />
          <Stack.Screen
            name="VenueDetails"
            component={VenueDetailsScreen}
            options={({ route }) => ({ title: route.params.venue.name })}
          />
          <Stack.Screen
            name="DeleteAccount"
            component={DeleteAccountScreen}
            options={{
              title: 'Delete Account',
              headerStyle: { backgroundColor: '#FF5252' },
              headerTintColor: '#FFFFFF'
            }}
          />
          <Stack.Screen
            name="ArtistPicker"
            component={ArtistPickerScreen}
            initialParams={{ mode: 'profile' }}
            options={{ title: 'Your Artists' }}
          />
          <Stack.Screen
            name="QRScanner"
            component={QRScannerScreen}
            options={{
              title: 'Scan QR Code',
              headerShown: false
            }}
          />
        </Stack.Group>
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
