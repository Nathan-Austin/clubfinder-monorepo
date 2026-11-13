import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as authService from '../services/authService';
import { purgeLegacySpotifyData } from '../utils/legacySpotify';
import axiosClient from '../api/axiosClient';
import * as mobileBarService from '../services/mobileBarService';

// Use the same User type that we defined in authService
import type { LoginResponse } from '../services/authService';

type User = {
  isFirstTimeUser: boolean;
  id: string;
  email: string;
  name?: string;
  city?: string;
  onboarding_complete?: boolean;
  onboardingComplete?: boolean;
  userType?: 'customer' | 'bar';
  /** The artist picker step, from the login response (server: src/lib/taste/onboarding.ts) */
  artistOnboarding?: ArtistOnboarding;
};

type ArtistOnboarding = {
  required: boolean;
  min: number;
  max: number;
  favouriteCount: number;
};

/** Set once a user has finished or skipped the artist step on this device */
const artistOnboardingSeenKey = (userId: string) => `artistOnboardingSeen:${userId}`;

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithCredentials: (user: User, token: string) => Promise<void>;
  logout: (cleanupAll?: boolean) => Promise<void>;
  refreshAuthState: () => Promise<void>;
  userType: 'customer' | 'bar' | null;
  isBarManager: boolean;
  barLogin: (email: string, password: string) => Promise<void>;
  /** Ends the artist picker step (Continue or Skip); RootNavigator then shows the tabs */
  finishArtistOnboarding: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to set auth header
const setAuthHeader = async (): Promise<void> => {
  const token = await AsyncStorage.getItem('authToken');

  if (token) {
    console.log('Setting auth header with token');
    axiosClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    console.log('No token available, clearing auth header');
    delete axiosClient.defaults.headers.common['Authorization'];
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userType, setUserType] = useState<'customer' | 'bar' | null>(null);

  // Load user data on app start, and drop any Spotify tokens an older build left behind
  // (per-account Spotify connect is retired; see utils/legacySpotify.ts)
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await refreshAuthState();
      } catch (error) {
        console.error('Error initializing auth:', error);
      }
      await purgeLegacySpotifyData(AsyncStorage);
    };

    initializeAuth();
  }, []);
  // Function to refresh the auth state (can be called after login/logout)
  const refreshAuthState = async () => {
    try {
      setIsLoading(true);

      const [userString, userTypeString, onboardingComplete] = await Promise.all([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('userType'),
        AsyncStorage.getItem('onboarding_complete')
      ]);
      setUserType(userTypeString as 'customer' | 'bar' | null);
      // Update user state
      if (userString) {
        const userData = JSON.parse(userString);

        // Ensure consistent onboarding status
        const normalizedUser = {
          ...userData,
          onboardingComplete: userData.onboardingComplete === true || userData.onboarding_complete === true || onboardingComplete === 'true',
          onboarding_complete: userData.onboardingComplete === true || userData.onboarding_complete === true || onboardingComplete === 'true'
        };

        setUser(normalizedUser);

        // Update stored user data if needed
        if (normalizedUser.onboardingComplete !== userData.onboardingComplete ||
          normalizedUser.onboarding_complete !== userData.onboarding_complete) {
          await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
          await AsyncStorage.setItem('onboarding_complete', normalizedUser.onboardingComplete.toString());
          console.log('AuthContext: Updated inconsistent onboarding status in storage');
        }
      } else {
        setUser(null);
      }

      // Setup auth header for API requests
      await setAuthHeader();
    } catch (error) {
      console.error('Failed to load auth state', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Login with email and password
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const loginResponse = await authService.login({ email, password });

      // If login is successful but we don't have the expected format,
      // convert to the expected format
      if (loginResponse.success && loginResponse.token) {
        // loginResponse.user is now properly typed
        const normalizedUser: User = {
          ...loginResponse.user,
          isFirstTimeUser: loginResponse.user.isFirstTimeUser ?? false, // Ensure boolean type
        };
        setUser(normalizedUser);
        return;
      }

      throw new Error('Login response format invalid');
    } catch (error) {
      console.error('Login failed', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const finishArtistOnboarding = async () => {
    if (!user) return;
    await AsyncStorage.setItem(artistOnboardingSeenKey(user.id), '1');
    const updated: User = {
      ...user,
      artistOnboarding: user.artistOnboarding
        ? { ...user.artistOnboarding, required: false }
        : undefined
    };
    await AsyncStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
  };

  // Login with pre-fetched credentials

  const loginWithCredentials = async (userData: User, token: string) => {
    setIsLoading(true);
    try {
      // Always ensure both onboarding fields are set consistently
      const isOnboardingComplete = userData.onboardingComplete === true || userData.onboarding_complete === true;

      // The server asks for the artist step while the user has fewer than 3 favourites. Once it
      // has been finished or skipped on this device it is not shown again on every login; the
      // profile still has the picker.
      const artistStepSeen =
        userData.id && (await AsyncStorage.getItem(artistOnboardingSeenKey(userData.id))) === '1';
      const artistOnboarding = userData.artistOnboarding
        ? { ...userData.artistOnboarding, required: userData.artistOnboarding.required && !artistStepSeen }
        : undefined;

      const normalizedUser = {
        ...userData,
        // Ensure both properties are set correctly
        onboardingComplete: isOnboardingComplete,
        onboarding_complete: isOnboardingComplete,
        artistOnboarding
      };

      // Save token
      await AsyncStorage.setItem('authToken', token);

      // Save user data
      await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));

      // Save city if available
      if (normalizedUser.city) {
        await AsyncStorage.setItem('userCity', normalizedUser.city);
      }

      // Explicitly save onboarding status
      await AsyncStorage.setItem('onboarding_complete', isOnboardingComplete.toString());

      // Set the auth header
      await setAuthHeader();

      // Update state
      setUser(normalizedUser);
    } catch (error) {
      console.error('Login state update failed', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Add bar login method
  // In AuthContext.tsx, in the barLogin function

  const barLogin = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await mobileBarService.barLogin(email, password);

      if (response.success && response.token && response.barData) {
        // Set user type to 'bar'
        await AsyncStorage.setItem('userType', 'bar');
        setUserType('bar');

        // Store bar data
        await AsyncStorage.setItem('barId', response.barData.id);
        await AsyncStorage.setItem('barName', response.barData.name);

        // Set auth token
        await AsyncStorage.setItem('authToken', response.token);
        await setAuthHeader();

        // Create a bar user object for the auth context
        const barUserData = {
          id: response.barData.id,
          email: response.barData.email || email,
          name: response.barData.name,
          isFirstTimeUser: false,
          onboarding_complete: true,
          onboardingComplete: true,
          userType: 'bar' as 'bar'
        };

        setUser(barUserData);
        await AsyncStorage.setItem('user', JSON.stringify(barUserData));

        await purgeLegacySpotifyData(AsyncStorage);
      } else {
        throw new Error(response.error || 'Failed to log in');
      }
    } catch (error) {
      console.error('Bar login failed', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };


  // Logout with additional data cleanup option
  const logout = async (cleanupAll: boolean = false) => {
    setIsLoading(true);
    try {
      await authService.logout();

      if (userType === 'bar') {
        // Clean up bar-specific data
        await AsyncStorage.removeItem('barId');
        await AsyncStorage.removeItem('barName');
      }
      await purgeLegacySpotifyData(AsyncStorage);

      if (cleanupAll) {
        await AsyncStorage.clear();
      } else {
        await AsyncStorage.removeItem('authToken');
        await AsyncStorage.removeItem('user');
        await AsyncStorage.removeItem('userType');
        await AsyncStorage.removeItem('userCity');
      }

      // Clear state
      setUser(null);
      setUserType(null);

      await setAuthHeader(); // This will clear the auth header too
    } catch (error) {
      console.error('Logout failed', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      login,
      loginWithCredentials,
      barLogin,
      logout,
      refreshAuthState,
      userType,
      isBarManager: userType === 'bar',
      finishArtistOnboarding
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
