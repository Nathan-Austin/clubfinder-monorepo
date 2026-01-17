import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image, Text, ActivityIndicator, View } from 'react-native';

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
import VenueCacheDebugScreen from '../screens/VenueCacheDebugScreen';
import QRCodeGeneratorScreen from '../screens/QRCodeGeneratorScreen';
import QRScannerScreen from '../screens/QRScannerScreen';

// Define the types for the various navigators
export type MainTabParamList = {
  Home: { refresh?: boolean };
  Profile: undefined;
  Discover: { venueType?: 'bar' | 'club'; refresh?: boolean };
  Search: undefined;
  Tilki: undefined;
  BarManager: undefined;
};
export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Main: undefined;
  EmailVerification: { email: string };
  VenueDetails: { venue: Venue };
  Terms: undefined;
  PrivacyPolicy: undefined;
  DeleteAccount: undefined;
  BarRegistration: undefined;
  BarConfirmation: { email: string };
  BarDashboard: undefined;
  BarManager: undefined;
  VenueCacheDebug: undefined;
  QRScanner: undefined;
};


// Create navigators
const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

// Main Tab Navigator (bottom tabs inside the app)
const MainTabNavigator = () => {
  const [showTilki, setShowTilki] = useState(false);

  // Check if we should show Tilki tab based on stored venues or genres
  useEffect(() => {
    const checkTilkiData = async () => {
      const hasGenres = await AsyncStorage.getItem('selected-genres');
      const hasBars = await AsyncStorage.getItem('matching-bars');
      const hasClubs = await AsyncStorage.getItem('matching-clubs');

      if (hasGenres || hasBars || hasClubs) {
        setShowTilki(true);
      }
    };

    checkTilkiData();

    // Also check periodically
    const interval = setInterval(checkTilkiData, 5000);
    return () => clearInterval(interval);
  }, []);

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
        tabBarActiveTintColor: '#D35400',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          backgroundColor: '#121212',
          borderTopColor: '#333333',
        },
        headerStyle: {
          backgroundColor: '#D35400',
        },
        headerTintColor: '#FFFFFF',
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Nearby Venues' }} />
      <Tab.Screen name="Discover" component={DiscoveryScreen} options={{ title: 'Find Your Vibe' }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Search' }} />
      {showTilki && <Tab.Screen name="Tilki" component={TilkiScreen} options={{ title: 'Tilki' }} />}
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'My Profile' }} />
    </Tab.Navigator>
  );
};
const BarStack = createStackNavigator();

const BarNavigator = () => (
  <BarStack.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: '#D35400' },
      headerTintColor: '#FFFFFF',
    }}
  >
    <BarStack.Screen
      name="BarHome"
      component={BarHomeScreen}
      options={{ title: 'Dashboard' }}
    />
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
    <BarStack.Screen
      name="QRCodeGenerator"
      component={QRCodeGeneratorScreen}
      options={{ title: 'QR Code Management' }}
    />
  </BarStack.Navigator>
);

// Main App Navigator (single level, simplified structure)
const RootNavigator = () => {
  const { user, isLoading, userType } = useAuth();
  const isBarManager = userType === 'bar';
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
        <ActivityIndicator size="large" color="#D35400" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#D35400' },
          headerTintColor: '#FFFFFF',
        }}
      >
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
            name="VenueCacheDebug"
            component={VenueCacheDebugScreen}
            options={{
              title: 'Cache Manager',
              headerStyle: { backgroundColor: '#D35400' },
              headerTintColor: '#FFFFFF'
            }}
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
