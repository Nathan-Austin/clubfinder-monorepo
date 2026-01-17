import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View, Image, Alert } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

type SpotifyAuthButtonProps = {
    onSuccess?: () => void;
    style?: object;
    textStyle?: object;
    showIcon?: boolean;
    text?: string;
    disconnectText?: string;
    disconnectEnabled?: boolean;
    userType?: 'bar' | 'customer';
};

const SpotifyAuthButton = ({
    onSuccess,
    style,
    textStyle,
    showIcon = true,
    text = 'Connect with Spotify',
    disconnectText = 'Disconnect from Spotify',
    disconnectEnabled = false,
    userType = 'customer' // Default to customer
}: SpotifyAuthButtonProps) => {
    const { isSpotifyConnected, spotifyAuth, disconnectSpotify, spotifyConnecting } = useAuth();
    const [isConnecting, setIsConnecting] = useState(false);

    const handlePress = async () => {
        try {
            if (isSpotifyConnected && disconnectEnabled) {
                // Disconnect from Spotify
                await disconnectSpotify();
                Alert.alert('Success', 'Disconnected from Spotify');
            } else {
                setIsConnecting(true);

                // Use the AuthContext's spotifyAuth method
                await spotifyAuth(userType);



                // If we got here without an error, it was successful
                Alert.alert('Success', 'Connected to Spotify successfully!');

                // Call onSuccess callback if provided
                if (onSuccess) {
                    onSuccess();
                }
            }
        } catch (error) {
            console.error('Spotify auth error', error);
            Alert.alert(
                'Connection Failed',
                error instanceof Error ? error.message : 'Failed to connect to Spotify. Please try again.'
            );
        } finally {
            setIsConnecting(false);
        }
    };

    // Determine if button should be in loading state
    const isLoading = isConnecting || spotifyConnecting;

    return (
        <TouchableOpacity
            style={[
                styles.button,
                isSpotifyConnected ? styles.connectedButton : null,
                style
            ]}
            onPress={handlePress}
            disabled={isLoading || (isSpotifyConnected && !disconnectEnabled)}
        >
            {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
                <View style={styles.buttonContent}>
                    {showIcon && (
                        <Image
                            source={require('../../assets/Spotify_Primary_Logo_RGB_Green.png')}
                            style={styles.icon}
                        />
                    )}
                    <Text style={[
                        styles.buttonText,
                        isSpotifyConnected ? styles.connectedText : null,
                        textStyle
                    ]}>
                        {isSpotifyConnected
                            ? (disconnectEnabled ? disconnectText : 'Connected to Spotify')
                            : text
                        }
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        backgroundColor: '#D35400', // Theme color
        padding: 15,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 10,
    },
    connectedButton: {
        backgroundColor: '#333333', // Darker when connected
        borderWidth: 1,
        borderColor: '#D35400',
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: {
        width: 24,
        height: 24,
        marginRight: 10,
    },
    buttonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    connectedText: {
        color: '#D35400',
    }
});

export default SpotifyAuthButton;
