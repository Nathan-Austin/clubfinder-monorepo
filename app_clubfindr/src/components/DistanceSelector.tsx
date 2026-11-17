import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert } from 'react-native';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { colors } from '../theme';

type DistanceSelectorProps = {
    distance: number;
    onDistanceChange: (distance: number) => void;
    enabled: boolean;
    onEnableChange: (enabled: boolean) => void;
};

const DistanceSelector: React.FC<DistanceSelectorProps> = ({
    distance,
    onDistanceChange,
    enabled,
    onEnableChange
}) => {
    const [showModal, setShowModal] = useState(false);
    const [sliderValue, setSliderValue] = useState(distance); // in meters
    const [locationPermissionStatus, setLocationPermissionStatus] = useState<string | null>(null);

    useEffect(() => {
        checkLocationPermission();
    }, []);

    const checkLocationPermission = async () => {
        const { status } = await Location.getForegroundPermissionsAsync();
        setLocationPermissionStatus(status);
    };

    const requestLocationPermission = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setLocationPermissionStatus(status);

        if (status === 'granted') {
            onEnableChange(true);
            return true;
        } else {
            Alert.alert(
                'Location Access',
                'We need your location to show venues near you. Please enable location permissions in your device settings.',
                [{ text: 'OK' }]
            );
            return false;
        }
    };

    const formatDistance = (meters: number): string => {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km`;
        } else {
            return `${Math.round(meters)} m`;
        }
    };

    const handleToggleFilter = async () => {
        if (!enabled && locationPermissionStatus !== 'granted') {
            const permissionGranted = await requestLocationPermission();
            if (!permissionGranted) {
                Alert.alert(
                    'Location Access Required',
                    'Distance filtering requires location access. You can still browse venues, but filtering by distance will not be available.',
                    [{ text: 'OK' }]
                );
                return;
            }
        }
        onEnableChange(!enabled);
    };

    const handleOpenModal = () => {
        if (locationPermissionStatus === 'granted') {
            setSliderValue(distance);
            setShowModal(true);
        } else {
            requestLocationPermission();
        }
    };

    const applyDistance = () => {
        onDistanceChange(sliderValue);
        if (!enabled) {
            onEnableChange(true);
        }
        setShowModal(false);
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={styles.statusContainer}
                onPress={handleToggleFilter}
            >
                <View style={[styles.statusIndicator, enabled ? styles.statusActive : styles.statusInactive]} />
                <Text style={[styles.statusText, enabled ? styles.textActive : styles.textInactive]}>
                    {enabled ? 'Distance filter on' : 'Distance filter off'}
                </Text>
            </TouchableOpacity>

            {enabled && (
                <TouchableOpacity style={styles.valueContainer} onPress={handleOpenModal}>
                    <Text style={styles.distanceText}>{formatDistance(distance)}</Text>
                    <Text style={styles.changeText}>Change</Text>
                </TouchableOpacity>
            )}

            <Modal
                visible={showModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Distance</Text>

                        <Text style={styles.distanceValue}>{formatDistance(sliderValue)}</Text>

                        <Slider
                            style={styles.slider}
                            minimumValue={500}
                            maximumValue={10000}
                            step={500}
                            value={sliderValue}
                            onValueChange={setSliderValue}
                            minimumTrackTintColor="#D35400"
                            maximumTrackTintColor="#333333"
                            thumbTintColor="#D35400"
                        />

                        <View style={styles.sliderLabels}>
                            <Text style={styles.sliderLabelText}>500m</Text>
                            <Text style={styles.sliderLabelText}>10km</Text>
                        </View>

                        <View style={styles.buttonRow}>
                            <TouchableOpacity
                                style={[styles.button, styles.cancelButton]}
                                onPress={() => setShowModal(false)}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.button, styles.applyButton]}
                                onPress={applyDistance}
                            >
                                <Text style={styles.applyButtonText}>Apply</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.surfaceAlt,
        borderRadius: 8,
        padding: 10,
        marginBottom: 15,
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusIndicator: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 8,
    },
    statusActive: {
        backgroundColor: colors.primary,
    },
    statusInactive: {
        backgroundColor: colors.grey500,
    },
    statusText: {
        fontSize: 14,
    },
    textActive: {
        color: colors.text,
        fontWeight: '500',
    },
    textInactive: {
        color: colors.textSecondary,
    },
    valueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    distanceText: {
        color: colors.primary,
        fontWeight: 'bold',
        fontSize: 14,
        marginRight: 5,
    },
    changeText: {
        color: colors.text,
        fontSize: 12,
        textDecorationLine: 'underline',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '80%',
        backgroundColor: colors.card,
        borderRadius: 10,
        padding: 20,
        alignItems: 'center',
    },
    modalTitle: {
        color: colors.text,
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    distanceValue: {
        color: colors.primary,
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    slider: {
        width: '100%',
        height: 40,
    },
    sliderLabels: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    sliderLabelText: {
        color: colors.textSecondary,
        fontSize: 12,
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 6,
        flex: 1,
        marginHorizontal: 5,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: colors.grey800,
    },
    applyButton: {
        backgroundColor: colors.primary,
    },
    cancelButtonText: {
        color: colors.text,
        fontWeight: '500',
    },
    applyButtonText: {
        color: colors.text,
        fontWeight: 'bold',
    },
});

export default DistanceSelector;
