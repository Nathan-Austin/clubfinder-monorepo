import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

type NetworkStatusProps = {
    showOfflineOnly?: boolean;
};

const { width } = Dimensions.get('window');

const NetworkStatus: React.FC<NetworkStatusProps> = ({ showOfflineOnly = true }) => {
    const [isConnected, setIsConnected] = useState<boolean | null>(true);
    const [networkType, setNetworkType] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const translateY = useState(new Animated.Value(-50))[0];

    useEffect(() => {
        // Subscribe to network state changes
        const unsubscribe = NetInfo.addEventListener(handleNetworkChange);

        // Initial check
        NetInfo.fetch().then(handleNetworkChange);

        return () => {
            unsubscribe();
        };
    }, []);

    const handleNetworkChange = (state: NetInfoState) => {
        setIsConnected(state.isConnected);
        setNetworkType(state.type);

        // If connection status changed, show banner
        const shouldBeVisible = showOfflineOnly ? !state.isConnected : true;
        if (shouldBeVisible !== isVisible) {
            setIsVisible(shouldBeVisible);
            Animated.timing(translateY, {
                toValue: shouldBeVisible ? 0 : -50,
                duration: 300,
                useNativeDriver: true
            }).start();
        }
    };

    // Don't render anything if not visible
    if (!isVisible) {
        return null;
    }

    const getStatusColor = () => {
        if (!isConnected) return '#f44336'; // Red for offline
        if (networkType === 'wifi' || networkType === 'ethernet') return '#4caf50'; // Green for wifi
        if (networkType === 'cellular') return '#ff9800'; // Orange for cellular
        return '#9e9e9e'; // Gray for unknown
    };

    const getNetworkTypeText = () => {
        if (!isConnected) return 'Offline';
        if (networkType === 'wifi') return 'WiFi';
        if (networkType === 'cellular') return 'Mobile Data';
        if (networkType === 'ethernet') return 'Ethernet';
        if (networkType === 'vpn') return 'VPN';
        if (networkType === 'unknown') return 'Unknown Connection';
        return networkType || 'Unknown';
    };

    return (
        <Animated.View
            style={[
                styles.container,
                { backgroundColor: getStatusColor(), transform: [{ translateY }] }
            ]}
        >
            <Text style={styles.text}>{getNetworkTypeText()}</Text>
            {isConnected === false && (
                <Text style={styles.subText}>Please check your connection</Text>
            )}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: 5,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        width,
        // Add some extra space for notch phones
        paddingTop: 30
    },
    text: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14
    },
    subText: {
        color: 'white',
        fontSize: 12
    }
});

export default NetworkStatus;