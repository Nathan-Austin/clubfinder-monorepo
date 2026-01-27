import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as authService from '../services/authService';
import * as mobileSpotifyService from '../services/mobileSpotifyService';
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
  spotify_id?: string;
  clientId?: string;
  clientSecret?: string;
  spotify_app_name?: string;
  onboarding_complete?: boolean;
  onboardingComplete?: boolean;
  userType?: 'customer' | 'bar';
  music_service?: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isSpotifyConnected: boolean;
  spotifyConnecting: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithCredentials: (user: User, token: string) => Promise<void>;
  logout: (cleanupAll?: boolean) => Promise<void>;
  spotifyAuth: (userType?: 'bar' | 'customer') => Promise<void>;
  disconnectSpotify: () => Promise<void>;
  refreshAuthState: () => Promise<void>;
  setIsSpotifyConnected: (connected: boolean) => void;
  userType: 'customer' | 'bar' | null;
  isBarManager: boolean;
  barLogin: (email: string, password: string) => Promise<void>;
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
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  const [spotifyConnecting, setSpotifyConnecting] = useState(false);
  const [userType, setUserType] = useState<'customer' | 'bar' | null>(null);

  // Load user data and check authentication status on app start
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await refreshAuthState();

        // Check Spotify connection state and tokens
        const spotifyConnected = await AsyncStorage.getItem('spotifyConnected');
        const accessToken = await AsyncStorage.getItem('spotify_access_token');
        const refreshToken = await AsyncStorage.getItem('spotify_refresh_token');

        if (spotifyConnected === 'true' && accessToken && refreshToken) {
          // Validate the connection
          const isValid = await mobileSpotifyService.validateSpotifyConnection();
          if (isValid) {
            setIsSpotifyConnected(true);
          } else {
            // Try to refresh the token
            const result = await mobileSpotifyService.refreshAccessToken();
            // Only update connected state if success or fatal error
            if (result.success) {
                setIsSpotifyConnected(true);
                await AsyncStorage.setItem('spotifyConnected', 'true');
            } else if (result.shouldDisconnect) {
                setIsSpotifyConnected(false);
                await AsyncStorage.setItem('spotifyConnected', 'false');
            }
            // If failed but not fatal (transient), keep existing state (assumed connected)
          }
        } else {
          setIsSpotifyConnected(false);
          await AsyncStorage.setItem('spotifyConnected', 'false');
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        setIsSpotifyConnected(false);
        await AsyncStorage.setItem('spotifyConnected', 'false');
      }
    };

    initializeAuth();

    // Set up periodic token refresh for Spotify
    const refreshInterval = setInterval(async () => {
      try {
        const spotifyConnected = await AsyncStorage.getItem('spotifyConnected');
        if (spotifyConnected === 'true') {
          const validToken = await mobileSpotifyService.ensureValidSpotifyToken();
          if (!validToken) {
            // Try to refresh the token
            const result = await mobileSpotifyService.refreshAccessToken();
            // Only update connected state if success or fatal error
            if (result.success) {
                setIsSpotifyConnected(true);
                await AsyncStorage.setItem('spotifyConnected', 'true');
            } else if (result.shouldDisconnect) {
                setIsSpotifyConnected(false);
                await AsyncStorage.setItem('spotifyConnected', 'false');
            }
            // If failed but not fatal (transient), keep existing state (assumed connected)
          }
        }
      } catch (error) {
        console.error('Error refreshing Spotify token:', error);
        setIsSpotifyConnected(false);
        await AsyncStorage.setItem('spotifyConnected', 'false');
      }
    }, 30 * 1000); // Check every 30 seconds

    return () => clearInterval(refreshInterval);
  }, []); // Remove isSpotifyConnected dependency to prevent circular updates
  // Function to refresh the auth state (can be called after login/logout)
  const refreshAuthState = async () => {
    try {
      setIsLoading(true);

      // Load user data and Spotify status in parallel
      const [userString, userTypeString, spotifyConnected, onboardingComplete] = await Promise.all([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('userType'),
        AsyncStorage.getItem('spotifyConnected'),
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

      // Update Spotify connected state
      setIsSpotifyConnected(spotifyConnected === 'true');

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

  // Login with pre-fetched credentials

  const loginWithCredentials = async (userData: User, token: string) => {
    setIsLoading(true);
    try {
      // Always ensure both onboarding fields are set consistently
      const isOnboardingComplete = userData.onboardingComplete === true || userData.onboarding_complete === true;

      const normalizedUser = {
        ...userData,
        // Ensure both properties are set correctly
        onboardingComplete: isOnboardingComplete,
        onboarding_complete: isOnboardingComplete
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

      // Store Spotify client credentials if available
      if (normalizedUser.clientId) {
        await mobileSpotifyService.storeClientCredentials(
          normalizedUser.clientId,
          normalizedUser.clientSecret || ''
        );
      }

      // If user has a Spotify ID, mark Spotify as connected
      if (normalizedUser.spotify_id) {
        await AsyncStorage.setItem('spotifyConnected', 'true');
        setIsSpotifyConnected(true);

        // Ensure we have a valid token by triggering a refresh
        const result = await mobileSpotifyService.refreshAccessToken();
        if (result.shouldDisconnect) {
          await AsyncStorage.setItem('spotifyConnected', 'false');
          setIsSpotifyConnected(false);
        }
      } else {
        // Check if we have stored Spotify tokens
        const accessToken = await AsyncStorage.getItem('spotify_access_token');
        const refreshToken = await AsyncStorage.getItem('spotify_refresh_token');

        if (accessToken && refreshToken) {
          // We have tokens but the user object doesn't show a connection,
          // so try to validate and restore the connection
          const isValid = await mobileSpotifyService.validateSpotifyConnection();
          if (isValid) {
            await AsyncStorage.setItem('spotifyConnected', 'true');
            setIsSpotifyConnected(true);

            // Update the backend with the connection status
            try {
              await axiosClient.post('/api/mobile/spotify/reconnect', {
                userId: normalizedUser.id
              });
            } catch (reconnectError) {
              console.warn('Failed to reconnect Spotify on backend:', reconnectError);
            }
          }
        }
      }

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
      console.log('Bar login response contains spotify info:', !!response.spotify);
      if (response.spotify) {
        console.log('Spotify client ID from response:', response.spotify.client_id);
      }

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
          userType: 'bar' as 'bar',
          music_service: response.barData.music_service || ''
        };

        setUser(barUserData);
        await AsyncStorage.setItem('user', JSON.stringify(barUserData));


        if (response.spotify) {
          // Also store the current user type for Spotify context
          await AsyncStorage.setItem('spotifyUserType', 'bar');

          if (response.spotify?.client_id && response.spotify?.client_secret) {
            console.log(`Storing bar client credentials with ID: ${response.spotify.client_id.substring(0, 6)}...`);
            await mobileSpotifyService.storeClientCredentials(
              response.spotify.client_id,
              response.spotify.client_secret,
              'bar'
            );
            console.log('Stored Spotify client credentials for bar');
          }
        }

        // Check for existing Spotify connection and restore tokens
        const spotifyConnected = await AsyncStorage.getItem('spotifyConnected');
        const accessToken = await AsyncStorage.getItem('spotify_access_token');
        const refreshToken = await AsyncStorage.getItem('spotify_refresh_token');

        if (spotifyConnected === 'true' && accessToken && refreshToken) {
          // Validate the existing connection
          const isValid = await mobileSpotifyService.validateSpotifyConnection();
          if (isValid) {
            setIsSpotifyConnected(true);
          } else {
            // Try to refresh the token
            const result = await mobileSpotifyService.refreshAccessToken();
            if (result.success) {
              setIsSpotifyConnected(true);
            } else if (result.shouldDisconnect) {
              setIsSpotifyConnected(false);
            }
          }
        } else {
          setIsSpotifyConnected(false);
          // Clear any stale Spotify data
          await AsyncStorage.removeItem('spotifyConnected');
          await AsyncStorage.removeItem('spotify_access_token');
          await AsyncStorage.removeItem('spotify_refresh_token');
        }
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


  const spotifyAuth = async (userType: 'bar' | 'customer' = 'customer'): Promise<void> => {
    try {
      setSpotifyConnecting(true);
      // Store the current user type for the Spotify context
      await AsyncStorage.setItem('spotifyUserType', userType);

      const response = await mobileSpotifyService.promptSpotifyAuth(userType);

      if (response.type === 'success') {
        const result = await mobileSpotifyService.handleSpotifyCallback(response, userType);

        if (result.success) {
          // Store Spotify app name if available
          if (result.spotifyApp?.name) {
            await AsyncStorage.setItem('spotifyAppName', result.spotifyApp.name);
          }

          // Existing login logic
          if (result.user && result.token) {
            await loginWithCredentials(result.user, result.token);
          }

          setIsSpotifyConnected(true);

          // If this is a bar manager, update the bar's Spotify connection status on backend
          if (userType === 'bar') {
            try {
              const barId = await AsyncStorage.getItem('barId');
              if (barId) {
                await axiosClient.post(`/api/mobile/bars/${barId}/spotify-connect`, {
                  connected: true
                });
              }
            } catch (barUpdateError) {
              console.warn('Failed to update bar Spotify connection status:', barUpdateError);
            }
          }
        } else {
          throw new Error(result.error || 'Spotify connection failed');
        }
      }
    } catch (error) {
      console.error('Spotify auth failed', error);
      throw error;
    } finally {
      setSpotifyConnecting(false);
    }
  };

  // Disconnect from Spotify
  const disconnectSpotify = async () => {
    try {
      await mobileSpotifyService.disconnectSpotify();
      setIsSpotifyConnected(false);

      // If this is a bar manager, update the bar's Spotify connection status on backend
      if (userType === 'bar') {
        try {
          const barId = await AsyncStorage.getItem('barId');
          if (barId) {
            await axiosClient.post(`/api/mobile/bars/${barId}/spotify-connect`, {
              connected: false
            });
          }
        } catch (barUpdateError) {
          console.warn('Failed to update bar Spotify disconnection status:', barUpdateError);
        }
      }
    } catch (error) {
      console.error('Failed to disconnect Spotify', error);
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
      } else if (cleanupAll) {
        // Clean up customer-specific data
        await mobileSpotifyService.disconnectSpotify();
        await AsyncStorage.removeItem('spotifyConnected');
      }

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
      if (cleanupAll) {
        setIsSpotifyConnected(false);
      }

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
      isSpotifyConnected,
      spotifyConnecting,
      login,
      loginWithCredentials,
      barLogin,
      logout,
      spotifyAuth,
      disconnectSpotify,
      refreshAuthState,
      setIsSpotifyConnected,
      userType,
      isBarManager: userType === 'bar'
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
