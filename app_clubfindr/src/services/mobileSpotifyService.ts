import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import axiosClient from '../api/axiosClient';
// Import expo-crypto for SHA-256 hashing (works better in Expo Go)
import * as Crypto from 'expo-crypto';

// Define types for AuthSession to avoid 'any' type errors
interface ExchangeCodeOptions {
    code: string;
    redirectUri: string;
    clientId: string;
    extraParams?: Record<string, string>;
}

interface TokenResponse {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    tokenType?: string;
    scope?: string;
}

// Define interfaces for our API responses
interface SpotifyUser {
    id: string;
    display_name?: string;
    email?: string;
    images?: Array<{ url: string }>;
    product?: string;
    country?: string;
}

interface RegisterResponse {
    success: boolean;
    user?: {
        id: string;
        name?: string;
        email?: string;
        city?: string;
        spotify_id?: string;
    };
    token?: string;
    spotifyApp?: {
        name: string;
    };
    message?: string;
}

// Auth response types
interface SpotifyCallbackResponse {
    type: string;
    params?: {
        code?: string;
        state?: string;
    };
    url?: string;
    error?: any;
}

interface HandleSpotifyCallbackResult {
    success: boolean;
    error?: string;
    user?: any;
    token?: string;
    spotifyApp?: {
        name: string;
    };
}

// Import expo-auth-session and expo-web-browser directly
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

// Ensure browser cleanup
WebBrowser.maybeCompleteAuthSession();

const isExpoGo = Constants.appOwnership === 'expo';
const isDevelopment = __DEV__;

// Spotify OAuth configuration
const discovery = {
    authorizationEndpoint: 'https://accounts.spotify.com/authorize',
    tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

// Constants for storage
const SPOTIFY_ACCESS_TOKEN = 'spotify_access_token';
const SPOTIFY_REFRESH_TOKEN = 'spotify_refresh_token';
const SPOTIFY_EXPIRATION = 'spotify_expiration';
const SPOTIFY_CLIENT_ID = 'spotify_client_id';
const SPOTIFY_CLIENT_SECRET = 'spotify_client_secret';
const SPOTIFY_CODE_VERIFIER = 'spotify_code_verifier';
const SPOTIFY_LAST_REFRESH = 'spotify_last_refresh';

/**
 * Check if the current access token is expired
 */
export const isTokenExpired = async (): Promise<boolean> => {
    try {
        const expiration = await AsyncStorage.getItem(SPOTIFY_EXPIRATION);
        if (!expiration) return true;

        const expiryTime = parseInt(expiration);
        const now = new Date().getTime();

        // Consider token expired if less than 5 minutes remaining
        return now >= (expiryTime - 5 * 60 * 1000);
    } catch (error) {
        console.error('Error checking token expiration:', error);
        return true;
    }
};

/**
 * Refresh the access token using the refresh token
 */
export const refreshAccessToken = async (): Promise<boolean> => {
    try {
        const refreshToken = await AsyncStorage.getItem(SPOTIFY_REFRESH_TOKEN);
        const userType = await AsyncStorage.getItem('spotifyUserType') as 'bar' | 'customer' || 'customer';
        const clientId = await getClientId(userType);

        if (!refreshToken || !clientId) {
            console.error('Missing refresh token or client ID');
            return false;
        }

        console.log(`Refreshing token using client ID for ${userType}`);

        // Get client secret in case this is a confidential client
        const clientSecret = await getClientSecret(userType);

        const tokenFormData = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        });

        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        // If we have client secret, use Basic auth
        if (clientSecret) {
            // Use simple base64 encoding for Basic Auth (not hashing)
            const credentials = `${clientId}:${clientSecret}`;
            const base64Credentials = global.btoa(credentials);
            headers['Authorization'] = `Basic ${base64Credentials}`;
            console.log('Using Basic Auth for token refresh with client ID + secret');
        } else {
            // For public clients, include client ID in form data
            tokenFormData.append('client_id', clientId);
            console.log('Using form parameters for token refresh with client ID only');
        }

        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers,
            body: tokenFormData.toString()
        });

        if (!response.ok) {
            console.error('Token refresh failed:', response.status);
            return false;
        }

        const tokenData = await response.json();

        // Store new tokens
        await AsyncStorage.setItem(SPOTIFY_ACCESS_TOKEN, tokenData.access_token);
        if (tokenData.refresh_token) {
            await AsyncStorage.setItem(SPOTIFY_REFRESH_TOKEN, tokenData.refresh_token);
        }

        // Update expiration
        const expirationTime = new Date().getTime() + (tokenData.expires_in || 3600) * 1000;
        await AsyncStorage.setItem(SPOTIFY_EXPIRATION, expirationTime.toString());

        // Store refresh timestamp
        await AsyncStorage.setItem(SPOTIFY_LAST_REFRESH, new Date().toISOString());

        return true;
    } catch (error) {
        console.error('Error refreshing token:', error);
        return false;
    }
};

/**
 * Get a valid access token, refreshing if necessary
 */
export const getValidAccessToken = async (): Promise<string | null> => {
    try {
        const isConnected = await AsyncStorage.getItem('spotifyConnected');

        if (isConnected !== 'true') {
            return null;
        }

        const expired = await isTokenExpired();

        if (expired) {
            const refreshed = await refreshAccessToken();
            if (!refreshed) {
                // If refresh fails, clear the connection state
                await AsyncStorage.setItem('spotifyConnected', 'false');
                return null;
            }
        }

        return AsyncStorage.getItem(SPOTIFY_ACCESS_TOKEN);
    } catch (error) {
        console.error('Error getting valid access token:', error);
        return null;
    }
};

export const ensureValidSpotifyToken = async (): Promise<boolean> => {
    try {
        const isConnected = await AsyncStorage.getItem('spotifyConnected');

        if (isConnected !== 'true') {
            return false;
        }

        const expired = await isTokenExpired();

        if (expired) {
            console.log('Spotify token expired, attempting refresh');
            return await refreshAccessToken();
        }

        return true;
    } catch (error) {
        console.error('Error validating Spotify token:', error);
        return false;
    }
};

export const validateSpotifyConnection = async (): Promise<boolean> => {
    try {
        // Try to get user profile as a connection test
        const response = await fetch('https://api.spotify.com/v1/me', {
            headers: {
                Authorization: `Bearer ${await getValidAccessToken()}`
            }
        });

        if (response.ok) {
            return true;
        }

        // If the request fails, try refreshing the token
        const refreshed = await refreshAccessToken();
        return refreshed;
    } catch (error) {
        console.error('Failed to validate Spotify connection:', error);
        return false;
    }
};

// Get the redirect URI based on environment - let AuthSession handle automatic closure
const SPOTIFY_REDIRECT_URI = AuthSession.makeRedirectUri({
    scheme: isDevelopment ? undefined : 'clubfindr', // Let AuthSession auto-detect in dev
    path: 'spotify-auth-callback'
});
console.log('Using redirect URI:', SPOTIFY_REDIRECT_URI);

/**
 * Store the client credentials for later use
 */
export const storeClientCredentials = async (
    clientId: string,
    clientSecret: string,
    userType?: 'bar' | 'customer'
): Promise<void> => {
    // If userType is not provided, try to get it from storage
    if (!userType) {
        userType = (await AsyncStorage.getItem('spotifyUserType') as 'bar' | 'customer') || 'customer';
    }

    // Always store the user type when storing credentials
    await AsyncStorage.setItem('spotifyUserType', userType);

    const idKey = userType === 'bar' ? 'bar_spotify_client_id' : SPOTIFY_CLIENT_ID;
    const secretKey = userType === 'bar' ? 'bar_spotify_client_secret' : SPOTIFY_CLIENT_SECRET;

    if (clientId) {
        await AsyncStorage.setItem(idKey, clientId);
        console.log(`Stored Spotify client ID for ${userType}: ${clientId.substring(0, 6)}...`);
    }

    if (clientSecret) {
        await AsyncStorage.setItem(secretKey, clientSecret);
        console.log(`Stored Spotify client secret for ${userType}`);
    }
};

/**
 * Get stored client ID
 */
export const getClientId = async (userType?: 'bar' | 'customer'): Promise<string | null> => {
    // If userType is not provided, try to get it from storage
    if (!userType) {
        userType = (await AsyncStorage.getItem('spotifyUserType') as 'bar' | 'customer') || 'customer';
    }

    // Use the appropriate key based on user type
    const key = userType === 'bar' ? 'bar_spotify_client_id' : SPOTIFY_CLIENT_ID;
    const clientId = await AsyncStorage.getItem(key);

    console.log(`Retrieved client ID for ${userType}: ${clientId ? clientId : 'not found'}`);
    return clientId;
};

/**
 * Get stored client secret based on user type
 */
export const getClientSecret = async (userType?: 'bar' | 'customer'): Promise<string | null> => {
    // If userType is not provided, try to get it from storage
    if (!userType) {
        userType = (await AsyncStorage.getItem('spotifyUserType') as 'bar' | 'customer') || 'customer';
    }

    // Use the appropriate key based on user type
    const key = userType === 'bar' ? 'bar_spotify_client_secret' : SPOTIFY_CLIENT_SECRET;
    return AsyncStorage.getItem(key);
};

/**
 * Simple function to generate a random string of specified length
 */
const generateRandomString = (length: number): string => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let text = '';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

/**
 * Generate code challenge from verifier using SHA-256 and crypto-js
 */
const generateCodeChallenge = async (codeVerifier: string): Promise<string> => {
    // Hash the code verifier with SHA-256 using expo-crypto
    const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        codeVerifier,
        { encoding: Crypto.CryptoEncoding.BASE64 }
    );

    // Convert regular base64 to URL-safe base64
    return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

/**
 * Prompt user for Spotify authentication
 */
export const promptSpotifyAuth = async (userType?: 'bar' | 'customer'): Promise<SpotifyCallbackResponse> => {
    console.log('=== SPOTIFY AUTH DEBUG ===');
    console.log(`Starting Spotify authentication process for ${userType || 'unspecified user type'}`);

    // If userType is not provided, try to get it from storage
    if (!userType) {
        userType = (await AsyncStorage.getItem('spotifyUserType') as 'bar' | 'customer') || 'customer';
        console.log(`Retrieved user type from storage: ${userType}`);
    }

    try {
        // Get the stored client ID for the correct user type
        const clientId = await getClientId(userType);

        if (!clientId) {
            console.error('No Spotify client ID available');
            throw new Error('Missing Spotify client ID. Please log in again.');
        }

        console.log('Using client ID:', clientId ? 'available' : 'missing');
        console.log('Using redirect URI:', SPOTIFY_REDIRECT_URI);

        // Generate a code verifier (between 43-128 chars as per PKCE spec)
        const codeVerifier = generateRandomString(64);
        console.log('Generated code verifier:', codeVerifier.substring(0, 10) + '...');
        await AsyncStorage.setItem(SPOTIFY_CODE_VERIFIER, codeVerifier);

        // Generate code challenge using SHA-256
        try {
            const codeChallenge = await generateCodeChallenge(codeVerifier);
            console.log('Generated code challenge:', codeChallenge.substring(0, 10) + '...');

            // Create state parameter to protect against CSRF
            const state = generateRandomString(16);

            // Create the authorization URL with all required parameters
            const authUrlObj = new URL(discovery.authorizationEndpoint);
            authUrlObj.searchParams.append('client_id', clientId);
            authUrlObj.searchParams.append('response_type', 'code');
            authUrlObj.searchParams.append('redirect_uri', SPOTIFY_REDIRECT_URI);
            authUrlObj.searchParams.append('code_challenge', codeChallenge);
            authUrlObj.searchParams.append('code_challenge_method', 'S256');
            authUrlObj.searchParams.append('scope', [
                'user-read-email',
                'user-top-read',
                'user-read-currently-playing',
                'user-read-playback-state',
                'playlist-read-private',
                'user-read-recently-played',
                'user-read-private'
            ].join(' '));
            const authUrl = authUrlObj.toString();

            console.log('Authorization URL with PKCE:', authUrl);

            // Ensure any previous auth session is completed
            WebBrowser.maybeCompleteAuthSession();

            // Start the auth flow using WebBrowser with enhanced configuration
            let result;
            try {
                const browserResult = await WebBrowser.openAuthSessionAsync(
                    authUrl,
                    SPOTIFY_REDIRECT_URI,
                    {
                        showInRecents: false,           // Prevent session conflicts
                        preferEphemeralSession: true,   // Don't persist cookies
                        createTask: false               // Android-specific fix for emulator crashes
                    }
                );

                // Transform WebBrowser result to include params for easier access
                result = {
                    type: browserResult.type,
                    params: browserResult.type === 'success' && 'url' in browserResult && browserResult.url
                        ? Object.fromEntries(new URL(browserResult.url).searchParams)
                        : undefined,
                    url: 'url' in browserResult ? browserResult.url : undefined
                };

                console.log('WebBrowser auth result:', result);
            } catch (webBrowserError) {
                console.error('WebBrowser auth failed:', webBrowserError);

                // Fallback - open in external browser
                console.log('Attempting external browser fallback...');
                await WebBrowser.openBrowserAsync(authUrl);
                throw new Error('Auth session failed, opened in external browser. Please complete OAuth manually and return to the app.');
            }

            console.log('Auth result type:', result.type);

            if (result.type === 'success' && result.url) {
                console.log('Auth result URL:', result.url);
            } else {
                console.log('Auth result:', JSON.stringify(result));
            }

            return result;
        } catch (error) {
            console.error('Error generating code challenge:', error);
            throw error;
        }
    } catch (error) {
        console.error('Error during Spotify auth prompt:', error);
        throw error;
    }
};

export const debugStoredCredentials = async (): Promise<void> => {
    const bar_client_id = await AsyncStorage.getItem('bar_spotify_client_id');
    const client_id = await AsyncStorage.getItem('spotify_client_id');
    const bar_client_secret = await AsyncStorage.getItem('bar_spotify_client_secret');
    const client_secret = await AsyncStorage.getItem('spotify_client_secret');
    const userType = await AsyncStorage.getItem('spotifyUserType');

    console.log('===== STORED SPOTIFY CREDENTIALS DEBUG =====');
    console.log('spotifyUserType:', userType);
    console.log('bar_spotify_client_id:', bar_client_id ? bar_client_id.substring(0, 10) + '...' : 'not found');
    console.log('spotify_client_id:', client_id ? client_id.substring(0, 10) + '...' : 'not found');
    console.log('bar_spotify_client_secret:', bar_client_secret ? 'found' : 'not found');
    console.log('spotify_client_secret:', client_secret ? 'found' : 'not found');
};
/**
 * Test deep linking capabilities
 */
export const testDeepLink = async (): Promise<void> => {
    try {
        const url = 'clubfindr://spotify-auth-callback?test=true';
        console.log(`Testing deep link: ${url}`);
        const result = await Linking.canOpenURL(url);
        console.log(`Can open URL: ${result}`);
        if (result) {
            await Linking.openURL(url);
        }
    } catch (error) {
        console.error('Deep link test failed:', error);
    }
};

/**
 * Handle the Spotify auth callback response
 */
export const handleSpotifyCallback = async (
    response: SpotifyCallbackResponse,
    userType?: 'bar' | 'customer'
): Promise<HandleSpotifyCallbackResult> => {
    try {
        // If userType is not provided, try to get it from storage
        if (!userType) {
            userType = (await AsyncStorage.getItem('spotifyUserType') as 'bar' | 'customer') || 'customer';
        }

        console.log(`Handling Spotify callback for ${userType}, response type:`, response.type);

        if (response.type === 'success') {
            // Get auth code from params
            const code = response.params?.code || new URL(response.url || '').searchParams.get('code') || '';

            if (!code) {
                console.error('No code found in response params');
                return { success: false, error: 'No code found in response' };
            }

            console.log('Got code from Spotify:', code.substring(0, 10) + '...');

            // Get the current user information
            const userString = await AsyncStorage.getItem('user');
            const user = userString ? JSON.parse(userString) : null;

            if (!user || !user.id) {
                console.error('No user found in storage');
                return { success: false, error: 'User not authenticated' };
            }

            // Get the code verifier we stored during the authorization request
            const codeVerifier = await AsyncStorage.getItem(SPOTIFY_CODE_VERIFIER);
            if (!codeVerifier) {
                console.error('No code verifier found in storage');
                return { success: false, error: 'No code verifier found for token exchange' };
            }

            console.log('Retrieved code verifier from storage:', codeVerifier.substring(0, 10) + '...');

            // Get client ID that should be stored after login
            try {
                // Get client credentials using the helper functions
                const clientId = await getClientId(userType);
                const clientSecret = await getClientSecret(userType);
                console.log(`Client credentials for ${userType} - ID: ${clientId ? clientId.substring(0, 6) + '...' : 'not found'}, Secret: ${clientSecret ? 'available' : 'not found'}`);

                if (!clientId) {
                    console.error('No client ID found in storage for', userType);
                    return { success: false, error: 'No Spotify client ID found' };
                }

                // Prepare the token exchange parameters
                const tokenFormData = new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: SPOTIFY_REDIRECT_URI,
                    code_verifier: codeVerifier
                });

                // For Spotify's confidential clients, we need to use HTTP Basic Auth
                const headers: Record<string, string> = {
                    'Content-Type': 'application/x-www-form-urlencoded'
                };

                // If we have client secret, use Basic auth (this is the critical fix)
                if (clientSecret) {
                    // Use simple base64 encoding for Basic Auth
                    const credentials = `${clientId}:${clientSecret}`;
                    const base64Credentials = global.btoa(credentials);

                    headers['Authorization'] = `Basic ${base64Credentials}`;
                    console.log('Using Basic Auth for token exchange with client ID + secret');

                    // IMPORTANT: When using Basic Auth, do NOT include client_id in the form data
                    // This is a common mistake that causes the 'invalid_client' error
                } else {
                    // For public clients (no secret), include client ID in form data
                    tokenFormData.append('client_id', clientId);
                    console.log('Using form parameters for token exchange with client ID only');
                }

                console.log('Making token exchange request with:');
                console.log('- Headers:', Object.keys(headers));
                console.log('- Form data params:', tokenFormData.toString());
                console.log('- Redirect URI:', SPOTIFY_REDIRECT_URI);

                const spotifyResponse = await fetch('https://accounts.spotify.com/api/token', {
                    method: 'POST',
                    headers,
                    body: tokenFormData.toString()
                });

                // Log the full response for debugging
                const responseText = await spotifyResponse.text();

                if (!spotifyResponse.ok) {
                    console.error(`Spotify token exchange failed: ${spotifyResponse.status}`);
                    console.error(`Response body: ${responseText}`);
                    return { success: false, error: `Spotify token exchange failed: ${spotifyResponse.status}` };
                }

                // Parse the response text again since we already consumed it
                const tokenData = JSON.parse(responseText);
                console.log('Token exchange successful!');

                if (!tokenData || !tokenData.access_token) {
                    console.error('Invalid token data from Spotify');
                    return { success: false, error: 'Invalid token data from Spotify' };
                }

                console.log('Successfully exchanged code for tokens. Now fetching user profile...');

                // Fetch the user's Spotify profile
                let spotifyProfile: SpotifyUser | null = null;
                try {
                    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
                        headers: {
                            Authorization: `Bearer ${tokenData.access_token}`
                        }
                    });

                    if (profileResponse.ok) {
                        spotifyProfile = await profileResponse.json();
                        console.log('Got Spotify profile for:', spotifyProfile?.display_name || spotifyProfile?.id || 'Unknown user');
                    } else {
                        console.warn('Failed to fetch Spotify profile, continuing anyway');
                    }
                } catch (profileError) {
                    console.warn('Error fetching Spotify profile, continuing anyway:', profileError);
                }

                // Now register these tokens with our backend
                console.log('Registering tokens with our backend...');
                const endpoint = userType === 'bar'
                    ? `/api/mobile/bars/${user.id}/spotify-connect`
                    : '/api/mobile/spotify/register';

                const payload = userType === 'bar' ? {
                    accessToken: tokenData.access_token,
                    refreshToken: tokenData.refresh_token,
                    expiresIn: tokenData.expires_in,
                    connected: true,
                    music_service: 'spotify',
                    spotifyProfile: spotifyProfile
                } : {
                    accessToken: tokenData.access_token,
                    refreshToken: tokenData.refresh_token,
                    expiresIn: tokenData.expires_in,
                    userId: user.id,
                    spotifyProfile: spotifyProfile
                };

                const response = await axiosClient.post(endpoint, payload);
                const registerResponse = response.data as RegisterResponse;

                // Store tokens
                await AsyncStorage.setItem(SPOTIFY_ACCESS_TOKEN, tokenData.access_token);
                if (tokenData.refresh_token) {
                    await AsyncStorage.setItem(SPOTIFY_REFRESH_TOKEN, tokenData.refresh_token);
                }

                // Set expiration time
                const expirationTime = new Date().getTime() + (tokenData.expires_in || 3600) * 1000;
                await AsyncStorage.setItem(SPOTIFY_EXPIRATION, expirationTime.toString());

                // Mark as connected
                await AsyncStorage.setItem('spotifyConnected', 'true');

                // Get auth token from response
                const token = registerResponse.token;

                // Also store the auth token if it's included in the response
                if (token) {
                    await AsyncStorage.setItem('authToken', token);
                }

                // Update user data if provided
                if (registerResponse.user) {
                    await AsyncStorage.setItem('user', JSON.stringify(registerResponse.user));
                    return {
                        success: true,
                        user: registerResponse.user,
                        token,
                        spotifyApp: registerResponse.spotifyApp
                    };
                }

                return {
                    success: true,
                    user,
                    token,
                    spotifyApp: registerResponse.spotifyApp
                };
            } catch (error) {
                console.error('Token exchange failed:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error during token exchange'
                };
            }
        } else {
            console.warn('Auth result was not successful:', response.type);
            return { success: false, error: 'Authentication canceled or failed' };
        }
    } catch (error) {
        console.error('Failed to handle Spotify callback:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
    }
};

/**
 * Disconnect from Spotify
 */
export const disconnectSpotify = async (): Promise<void> => {
    try {
        await AsyncStorage.removeItem(SPOTIFY_ACCESS_TOKEN);
        await AsyncStorage.removeItem(SPOTIFY_REFRESH_TOKEN);
        await AsyncStorage.removeItem(SPOTIFY_EXPIRATION);
        await AsyncStorage.removeItem('spotifyConnected');
        await AsyncStorage.removeItem('spotifyUser');
        await AsyncStorage.removeItem(SPOTIFY_CODE_VERIFIER);
        console.log('Successfully disconnected from Spotify');
    } catch (error) {
        console.error('Error disconnecting Spotify:', error);
    }
};

/**
 * Get user's Spotify profile
 */
export const getSpotifyProfile = async (): Promise<SpotifyUser | null> => {
    try {
        const accessToken = await getValidAccessToken();
        if (!accessToken) {
            console.log('No valid access token found for Spotify profile');
            return null;
        }

        const response = await fetch('https://api.spotify.com/v1/me', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error('Failed to fetch Spotify profile:', response.status);
            throw new Error('Failed to fetch profile');
        }

        const profile = await response.json();
        console.log('Fetched Spotify profile:', profile.display_name || profile.id);
        return profile;
    } catch (error) {
        console.error('Error fetching Spotify profile:', error);
        return null;
    }
};

/**
 * Get user's recently played tracks from Spotify
 */
export const getRecentlyPlayed = async (limit: number = 5): Promise<any[]> => {
    try {
        const accessToken = await getValidAccessToken();
        if (!accessToken) {
            console.log('No valid access token found for recently played tracks');
            return [];
        }

        const response = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error('Failed to fetch recently played tracks:', response.status);
            throw new Error('Failed to fetch recently played tracks');
        }

        const data = await response.json();

        // Transform the data
        const tracks = data.items.map((item: any) => ({
            id: item.track.id,
            name: item.track.name,
            artist: item.track.artists.map((artist: any) => artist.name).join(', '),
            albumImage: item.track.album.images[0]?.url || null,
            playedAt: item.played_at
        }));

        return tracks;
    } catch (error) {
        console.error('Error fetching recently played tracks:', error);
        return [];
    }
};

/**
 * Get user's top genres from Spotify data
 */
export const getUserGenres = async (): Promise<string[]> => {
    try {
        const accessToken = await getValidAccessToken();
        const authToken = await AsyncStorage.getItem('authToken');

        if (!accessToken || !authToken) {
            console.log('No valid tokens available for fetching genres');
            return [];
        }

        // Get user's top genres from our API
        const response = await axiosClient.get('/api/mobile/spotify/genres');
        const genres = response.data as string[];

        if (genres && Array.isArray(genres)) {
            return genres;
        }

        return [];
    } catch (error) {
        console.error('Failed to fetch user genres:', error);
        return [];
    }
};

/**
 * Test the Spotify integration
 */
export const testSpotifyIntegration = async (): Promise<Record<string, string>> => {
    try {
        const accessToken = await AsyncStorage.getItem(SPOTIFY_ACCESS_TOKEN);
        const refreshToken = await AsyncStorage.getItem(SPOTIFY_REFRESH_TOKEN);
        const expiration = await AsyncStorage.getItem(SPOTIFY_EXPIRATION);
        const authToken = await AsyncStorage.getItem('authToken');
        const userType = await AsyncStorage.getItem('spotifyUserType') as 'bar' | 'customer' || 'customer';
        const clientId = await getClientId(userType);
        const clientSecret = await getClientSecret(userType);
        const codeVerifier = await AsyncStorage.getItem(SPOTIFY_CODE_VERIFIER);

        let expiryStatus = 'No expiration set';
        if (expiration) {
            const expiryTime = parseInt(expiration);
            const now = new Date().getTime();
            const diff = expiryTime - now;

            if (diff > 0) {
                expiryStatus = `Valid for ${Math.floor(diff / 60000)} more minutes`;
            } else {
                expiryStatus = `Expired ${Math.floor(Math.abs(diff) / 60000)} minutes ago`;
            }
        }

        // Test direct API access
        let spotifyApiStatus = 'Not tested';
        if (accessToken) {
            try {
                const response = await fetch('https://api.spotify.com/v1/me', {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });

                if (response.ok) {
                    const profile = await response.json();
                    spotifyApiStatus = `OK - ${profile.display_name || profile.id}`;
                } else {
                    spotifyApiStatus = `Failed - Status ${response.status}`;
                }
            } catch (error) {
                spotifyApiStatus = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            }
        }

        // Test our backend endpoint
        let backendStatus = 'Not tested';
        try {
            const response = await axiosClient.get('/api/mobile/spotify/status');
            const status = response.data as { status: string };
            backendStatus = `OK - ${JSON.stringify(status)}`;
        } catch (error) {
            backendStatus = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }

        return {
            accessToken: accessToken ? 'Available' : 'Not available',
            refreshToken: refreshToken ? 'Available' : 'Not available',
            clientId: clientId ? `Available (${clientId.substring(0, 6)}...)` : 'Not available',
            clientSecret: clientSecret ? 'Available (redacted)' : 'Not available',
            codeVerifier: codeVerifier ? `Available (${codeVerifier.substring(0, 6)}...)` : 'Not available',
            expiration: expiryStatus,
            redirectUri: SPOTIFY_REDIRECT_URI,
            spotifyApiStatus,
            backendStatus
        };
    } catch (error) {
        console.error('Spotify integration test failed:', error);
        return {
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};
