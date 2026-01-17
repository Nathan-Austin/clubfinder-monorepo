import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    Linking,
    Platform,
    Animated
} from 'react-native';
import { CameraView, BarcodeScanningResult } from 'expo-camera';
import { useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation';
import { useAuth } from '../contexts/AuthContext';
import axiosClient from '../api/axiosClient';

type QRScannerScreenNavigationProp = StackNavigationProp<RootStackParamList, 'QRScanner'>;

interface CheckInResponse {
    success: boolean;
    message: string;
    matchCount?: number;
    venueId?: string;
    venueName?: string;
    checkinCount?: number;
}

const QRScannerScreen = () => {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);
    const [loading, setLoading] = useState(false);
    const [flashOn, setFlashOn] = useState(false);
    const [success, setSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [matchCount, setMatchCount] = useState<number | null>(null);
    const [checkinCount, setCheckinCount] = useState<number | null>(null);
    const [venueName, setVenueName] = useState<string | null>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const navigation = useNavigation<QRScannerScreenNavigationProp>();
    const { user } = useAuth();

    // Animation values
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const successScale = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Request camera permission on component mount
        const getCameraPermissions = async () => {
            const { status } = await requestPermission();
            setHasPermission(status === 'granted');

            if (status !== 'granted') {
                Alert.alert(
                    'Camera Permission',
                    'We need camera access to scan QR codes. Please grant permission in your settings.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Settings',
                            onPress: () => {
                                if (Platform.OS === 'ios') {
                                    Linking.openURL('app-settings:');
                                } else {
                                    Linking.openSettings();
                                }
                            }
                        }
                    ]
                );
            }
        };

        getCameraPermissions();

        // Start frame animation
        Animated.loop(
            Animated.sequence([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0.3,
                    duration: 1000,
                    useNativeDriver: true,
                })
            ])
        ).start();
    }, []);

    // Handle successful scan animation
    useEffect(() => {
        if (success) {
            Animated.sequence([
                Animated.timing(successScale, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true
                }),
                Animated.delay(2000),
                Animated.timing(successScale, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true
                })
            ]).start(() => {
                // Reset success state after animation completes
                setSuccess(false);
                setScanned(false);
            });
        }
    }, [success]);

    const handleBarCodeScanned = async ({ type, data }: BarcodeScanningResult) => {
        if (scanned || loading) return;

        setScanned(true);

        try {
            // Parse the QR code data (deeplink format)
            console.log('Scanned QR code data:', data);

            // Check if it's our specific QR code format
            if (!data.startsWith('clubfindr://checkin')) {
                Alert.alert('Invalid QR Code', 'This is not a valid Clubfindr/Tilki QR code.');
                setScanned(false);
                return;
            }

            // Parse the URL parameters
            const url = new URL(data.replace('clubfindr://', 'https://'));
            const barId = url.searchParams.get('barId');
            const qrId = url.searchParams.get('qrId');
            const qrType = url.searchParams.get('type');

            if (!barId || !qrId) {
                Alert.alert('Invalid QR Code', 'This QR code is missing required information.');
                setScanned(false);
                return;
            }

            // Process the check-in
            setLoading(true);

            if (!user || !user.id) {
                Alert.alert('Authentication Required', 'Please log in to check in to venues.');
                setScanned(false);
                setLoading(false);
                return;
            }

            const response = await axiosClient.post('/api/mobile/checkin', {
                userId: user.id,
                barId,
                qrId,
                qrType
            });

            const responseData = response.data as CheckInResponse;

            if (responseData.success) {
                setSuccess(true);
                setSuccessMessage(responseData.message || 'Check-in successful!');
                setMatchCount(responseData.matchCount || null);
                setVenueName(responseData.venueName || null);
                setCheckinCount(responseData.checkinCount || null);

                // Show success message
                console.log('Check-in successful:', responseData);
            } else {
                // Handle error
                Alert.alert('Check-in Failed', responseData.message || 'Failed to check in. Please try again.');
                setScanned(false);
            }
        } catch (error) {
            console.error('Error during check-in:', error);
            Alert.alert('Error', 'An error occurred while processing your check-in. Please try again.');
            setScanned(false);
        } finally {
            setLoading(false);
        }
    };

    const handleViewVenue = () => {
        // TODO: Navigate to venue details if we have the venue ID
        setScanned(false);
        setSuccess(false);
    };

    if (hasPermission === null) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#D35400" />
                <Text style={styles.text}>Requesting camera permission...</Text>
            </View>
        );
    }

    if (hasPermission === false) {
        return (
            <View style={styles.container}>
                <Ionicons name="camera" size={64} color="#CCCCCC" />
                <Text style={styles.text}>No access to camera</Text>
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => {
                        if (Platform.OS === 'ios') {
                            Linking.openURL('app-settings:');
                        } else {
                            Linking.openSettings();
                        }
                    }}
                >
                    <Text style={styles.buttonText}>Open Settings</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                style={styles.camera}
                facing="back"
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                enableTorch={flashOn}>
                <View style={styles.overlay}>
                    <View style={styles.header}>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => navigation.goBack()}
                        >
                            <Ionicons name="close" size={30} color="#FFFFFF" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.flashButton}
                            onPress={() => setFlashOn(!flashOn)}
                        >
                            <Ionicons
                                name={flashOn ? "flash" : "flash-off"}
                                size={24}
                                color="#FFFFFF"
                            />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.scanArea}>
                        <Animated.View
                            style={[
                                styles.scanFrame,
                                { opacity: fadeAnim }
                            ]}
                        />

                        {loading && (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#D35400" />
                                <Text style={styles.loadingText}>Processing...</Text>
                            </View>
                        )}

                        <Animated.View
                            style={[
                                styles.successContainer,
                                {
                                    opacity: successScale,
                                    transform: [{ scale: successScale }]
                                }
                            ]}
                        >
                            <View style={styles.successContent}>
                                <Ionicons name="checkmark-circle" size={64} color="#1DB954" />
                                <Text style={styles.successTitle}>Check-in Successful!</Text>

                                {venueName && (
                                    <Text style={styles.venueName}>{venueName}</Text>
                                )}

                                <Text style={styles.successText}>{successMessage}</Text>

                                {matchCount !== null && matchCount > 0 && (
                                    <View style={styles.matchContainer}>
                                        <Text style={styles.matchText}>
                                            {matchCount} music {matchCount === 1 ? 'genre' : 'genres'} matched!
                                        </Text>
                                    </View>
                                )}

                                {checkinCount !== null && checkinCount > 0 && (
                                    <Text style={styles.checkinText}>
                                        You've checked in {checkinCount} {checkinCount === 1 ? 'time' : 'times'}!
                                    </Text>
                                )}
                            </View>
                        </Animated.View>
                    </View>

                    <View style={styles.footer}>
                        <Text style={styles.instructions}>
                            Align QR code within the scanner frame
                        </Text>
                    </View>
                </View>
            </CameraView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    camera: {
        flex: 1,
        width: '100%',
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'space-between',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 20,
        paddingTop: 50,
    },
    closeButton: {
        padding: 10,
    },
    flashButton: {
        padding: 10,
    },
    scanArea: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 300,
    },
    scanFrame: {
        width: 250,
        height: 250,
        borderWidth: 2,
        borderColor: '#D35400',
        borderRadius: 12,
        backgroundColor: 'transparent',
    },
    footer: {
        alignItems: 'center',
        padding: 20,
        paddingBottom: 40,
    },
    instructions: {
        color: '#FFFFFF',
        fontSize: 16,
        textAlign: 'center',
    },
    text: {
        color: '#FFFFFF',
        fontSize: 18,
        marginTop: 20,
        textAlign: 'center',
    },
    button: {
        marginTop: 20,
        backgroundColor: '#D35400',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    loadingContainer: {
        position: 'absolute',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        padding: 20,
        borderRadius: 10,
        alignItems: 'center',
    },
    loadingText: {
        color: '#FFFFFF',
        marginTop: 10,
    },
    successContainer: {
        position: 'absolute',
        width: 300,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        padding: 20,
        borderRadius: 10,
        alignItems: 'center',
    },
    successContent: {
        alignItems: 'center',
    },
    successTitle: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 15,
        marginBottom: 5,
    },
    venueName: {
        color: '#D35400',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    successText: {
        color: '#FFFFFF',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 15,
    },
    matchContainer: {
        backgroundColor: 'rgba(29, 185, 84, 0.2)',
        padding: 10,
        borderRadius: 8,
        marginBottom: 10,
    },
    matchText: {
        color: '#1DB954',
        fontWeight: 'bold',
    },
    checkinText: {
        color: '#CCCCCC',
        fontSize: 14,
    },
    viewVenueButton: {
        backgroundColor: '#D35400',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        marginTop: 15,
    },
    viewVenueButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
});

export default QRScannerScreen;
