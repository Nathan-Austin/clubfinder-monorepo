// BarSpotifyConnect.tsx - Modified to always show connect button if needed
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import SpotifyAuthButton from './SpotifyAuthButton';
import * as mobileSpotifyService from '../services/mobileSpotifyService';
import axiosClient from '../api/axiosClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

type BarSpotifyConnectProps = {
    barMusicService?: string;
    onConnection?: () => void;
};

const BarSpotifyConnect = ({ barMusicService, onConnection }: BarSpotifyConnectProps) => {
    const { isSpotifyConnected, user, setIsSpotifyConnected } = useAuth();
    const [needsSpotifyConnection, setNeedsSpotifyConnection] = useState(false);
    const [hasValidToken, setHasValidToken] = useState(false);

    // Check connection status and token validity immediately and periodically
    useEffect(() => {
        const checkConnection = async () => {
            try {
                console.log('Checking Spotify connection status...');

                // Check if we have tokens
                const accessToken = await AsyncStorage.getItem('spotify_access_token');
                const refreshToken = await AsyncStorage.getItem('spotify_refresh_token');

                if (!accessToken || !refreshToken) {
                    console.log('No Spotify tokens found');
                    setHasValidToken(false);
                    setNeedsSpotifyConnection(true);
                    await AsyncStorage.setItem('spotifyConnected', 'false');
                    setIsSpotifyConnected(false);
                    return;
                }

                // Validate the token
                const isValid = await validateConnection();

                if (isValid) {
                    console.log('Spotify token valid');
                    setHasValidToken(true);
                    setNeedsSpotifyConnection(false);
                    await AsyncStorage.setItem('spotifyConnected', 'true');
                    setIsSpotifyConnected(true);
                } else {
                    console.log('Spotify token invalid');
                    setHasValidToken(false);
                    setNeedsSpotifyConnection(true);
                    await AsyncStorage.setItem('spotifyConnected', 'false');
                    setIsSpotifyConnected(false);
                }
            } catch (error) {
                console.error('Error checking Spotify connection:', error);
                setHasValidToken(false);
                setNeedsSpotifyConnection(true);
                await AsyncStorage.setItem('spotifyConnected', 'false');
                setIsSpotifyConnected(false);
            }
        };

        // Check immediately
        checkConnection();

        // Then check every minute
        const interval = setInterval(checkConnection, 60 * 1000);

        return () => clearInterval(interval);
    }, [barMusicService, setIsSpotifyConnected]);

    const validateConnection = async (): Promise<boolean> => {
        try {
            console.log('Validating Spotify connection...');

            // Check if we have the required tokens
            const accessToken = await AsyncStorage.getItem('spotify_access_token');
            const refreshToken = await AsyncStorage.getItem('spotify_refresh_token');

            if (!accessToken || !refreshToken) {
                console.log('Missing required Spotify tokens');
                return false;
            }

            // Try to validate the connection by calling the Spotify API
            const isValid = await mobileSpotifyService.validateSpotifyConnection();

            if (isValid) {
                console.log('Spotify connection validated successfully');
                return true;
            }

            console.log('Spotify connection invalid, trying to refresh token...');

            // If not valid, try to refresh
            const refreshed = await mobileSpotifyService.refreshAccessToken();

            if (!refreshed) {
                console.log('Failed to refresh Spotify token');
                return false;
            }

            console.log('Spotify token refreshed successfully');
            return true;
        } catch (error) {
            console.error('Error validating Spotify connection:', error);
            return false;
        }
    };

    const handleSpotifySuccess = async () => {
        try {
            console.log('Spotify connection success');

            if (onConnection) {
                onConnection();
            }

            // Set connection status
            await AsyncStorage.setItem('spotifyConnected', 'true');
            await AsyncStorage.setItem('spotifyUserType', 'bar');
            setIsSpotifyConnected(true);
            setHasValidToken(true);
            setNeedsSpotifyConnection(false);

            Alert.alert('Success', 'Spotify connected successfully! You can now display currently playing tracks.');
        } catch (error) {
            console.error('Error in handleSpotifySuccess:', error);
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
        }
    };

    const forceResetConnection = async () => {
        try {
            // Clear all Spotify-related storage
            await AsyncStorage.removeItem('spotify_access_token');
            await AsyncStorage.removeItem('spotify_refresh_token');
            await AsyncStorage.removeItem('spotify_expiration');
            await AsyncStorage.setItem('spotifyConnected', 'false');

            // Update state
            setIsSpotifyConnected(false);
            setHasValidToken(false);
            setNeedsSpotifyConnection(true);

            Alert.alert('Connection Reset', 'Spotify connection has been reset.');
        } catch (error) {
            console.error('Error resetting connection:', error);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Spotify Connection</Text>
                <View style={styles.statusContainer}>
                    {hasValidToken ? (
                        <View style={styles.connectedStatus}>
                            <Ionicons name="checkmark-circle" size={24} color="#1DB954" />
                            <Text style={styles.connectedText}>Connected</Text>
                        </View>
                    ) : (
                        <View style={styles.disconnectedStatus}>
                            <Ionicons name="close-circle" size={24} color="#D35400" />
                            <Text style={styles.disconnectedText}>Not Connected</Text>
                        </View>
                    )}
                </View>
            </View>

            {hasValidToken ? (
                <View style={styles.connectedContainer}>
                    <Text style={styles.connectedInfoText}>
                        Your Spotify account is connected. Currently playing tracks will be displayed below.
                    </Text>
                    <TouchableOpacity
                        style={styles.resetButton}
                        onPress={forceResetConnection}
                    >
                        <Text style={styles.resetButtonText}>Reset Connection</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.disconnectedContainer}>
                    <SpotifyAuthButton
                        onSuccess={handleSpotifySuccess}
                        text="Connect Spotify"
                        style={styles.connectButton}
                        userType='bar'
                    />
                    <Text style={styles.noteText}>
                        Connect to Spotify to display your currently playing music to customers.
                        Use the Spotify account connected to your venue's sound system.
                    </Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#2A2A2A',
        borderRadius: 12,
        padding: 24,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#333333',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: 'bold',
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    connectedStatus: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    disconnectedStatus: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    connectedText: {
        color: '#1DB954',
        fontWeight: 'bold',
        marginLeft: 6,
    },
    disconnectedText: {
        color: '#D35400',
        fontWeight: 'bold',
        marginLeft: 6,
    },
    connectedContainer: {
        alignItems: 'center',
    },
    disconnectedContainer: {
        alignItems: 'center',
    },
    connectButton: {
        backgroundColor: '#1DB954',
        marginBottom: 16,
        borderRadius: 25,
        paddingVertical: 15,
        width: '100%',
    },
    resetButton: {
        backgroundColor: '#333333',
        marginTop: 16,
        borderRadius: 25,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderWidth: 1,
        borderColor: '#FF5252',
    },
    resetButtonText: {
        color: '#FF5252',
        fontWeight: 'bold',
    },
    noteText: {
        color: '#BBBBBB',
        fontSize: 13,
        fontStyle: 'italic',
        textAlign: 'center',
        lineHeight: 18,
    },
    connectedInfoText: {
        color: '#FFFFFF',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
});

export default BarSpotifyConnect;
