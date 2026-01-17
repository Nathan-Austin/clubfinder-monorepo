import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert
} from 'react-native';
import VenueCache from '../utils/VenueCache';
import VenueCacheMonitor from '../utils/VenueCacheMonitor';
import * as discoveryService from '../services/discoveryService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheStats {
    bars: {
        hits: number;
        misses: number;
        hitRate: string;
        averageFilterTime: string;
        cacheAge: string;
    };
    clubs: {
        hits: number;
        misses: number;
        hitRate: string;
        averageFilterTime: string;
        cacheAge: string;
    };
}

const VenueCacheDebugScreen = () => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState<CacheStats | null>(null);
    const [barCount, setBarCount] = useState<number | null>(null);
    const [clubCount, setClubCount] = useState<number | null>(null);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            setLoading(true);

            // Load cached venue counts
            const barData = await AsyncStorage.getItem('venue_data_nearby_cache');
            const clubData = await AsyncStorage.getItem('club_data_nearby_cache');

            if (barData) {
                const bars = JSON.parse(barData);
                setBarCount(Array.isArray(bars) ? bars.length : 0);
            } else {
                setBarCount(0);
            }

            if (clubData) {
                const clubs = JSON.parse(clubData);
                setClubCount(Array.isArray(clubs) ? clubs.length : 0);
            } else {
                setClubCount(0);
            }

            // Load cache statistics
            const cacheStats = await VenueCacheMonitor.getStatistics();
            setStats(cacheStats);
        } catch (error) {
            console.error('Error loading cache stats:', error);
            Alert.alert('Error', 'Failed to load cache statistics');
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshCache = async () => {
        try {
            setRefreshing(true);

            // Get the city
            const city = await AsyncStorage.getItem('userCity') || 'berlin';

            // Refresh both caches
            await discoveryService.refreshVenueCache(city, 'bar');
            await discoveryService.refreshVenueCache(city, 'club');

            // Reload stats
            await loadStats();

            Alert.alert('Success', 'Cache refreshed successfully');
        } catch (error) {
            console.error('Error refreshing cache:', error);
            Alert.alert('Error', 'Failed to refresh cache');
        } finally {
            setRefreshing(false);
        }
    };

    const handleClearCache = async () => {
        Alert.alert(
            'Clear Cache',
            'Are you sure you want to clear the venue cache?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setRefreshing(true);

                            // Clear both caches
                            await VenueCache.clearCache();

                            // Reload stats
                            await loadStats();

                            Alert.alert('Success', 'Cache cleared successfully');
                        } catch (error) {
                            console.error('Error clearing cache:', error);
                            Alert.alert('Error', 'Failed to clear cache');
                        } finally {
                            setRefreshing(false);
                        }
                    }
                }
            ]
        );
    };

    const handleResetStatistics = async () => {
        Alert.alert(
            'Reset Statistics',
            'Are you sure you want to reset all cache statistics?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setRefreshing(true);

                            // Reset statistics
                            await VenueCacheMonitor.resetStatistics();

                            // Reload stats
                            await loadStats();

                            Alert.alert('Success', 'Statistics reset successfully');
                        } catch (error) {
                            console.error('Error resetting statistics:', error);
                            Alert.alert('Error', 'Failed to reset statistics');
                        } finally {
                            setRefreshing(false);
                        }
                    }
                }
            ]
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#D35400" />
                <Text style={styles.loadingText}>Loading cache statistics...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerText}>Venue Cache Debugger</Text>
                <Text style={styles.subHeaderText}>Monitor and manage the venue cache</Text>
            </View>

            {refreshing && (
                <View style={styles.refreshingContainer}>
                    <ActivityIndicator size="small" color="#D35400" />
                    <Text style={styles.refreshingText}>Updating...</Text>
                </View>
            )}

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Cache Status</Text>

                <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Bars cached:</Text>
                    <Text style={styles.statValue}>{barCount !== null ? barCount : 'Unknown'}</Text>
                </View>

                <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Clubs cached:</Text>
                    <Text style={styles.statValue}>{clubCount !== null ? clubCount : 'Unknown'}</Text>
                </View>

                <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Bar cache age:</Text>
                    <Text style={styles.statValue}>{stats?.bars.cacheAge || 'Unknown'}</Text>
                </View>

                <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Club cache age:</Text>
                    <Text style={styles.statValue}>{stats?.clubs.cacheAge || 'Unknown'}</Text>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Performance</Text>

                <View style={styles.subsection}>
                    <Text style={styles.subsectionTitle}>Bars</Text>

                    <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Cache hits:</Text>
                        <Text style={styles.statValue}>{stats?.bars.hits || 0}</Text>
                    </View>

                    <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Cache misses:</Text>
                        <Text style={styles.statValue}>{stats?.bars.misses || 0}</Text>
                    </View>

                    <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Hit rate:</Text>
                        <Text style={styles.statValue}>{stats?.bars.hitRate || 'N/A'}</Text>
                    </View>

                    <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Avg filter time:</Text>
                        <Text style={styles.statValue}>{stats?.bars.averageFilterTime || 'N/A'}</Text>
                    </View>
                </View>

                <View style={styles.subsection}>
                    <Text style={styles.subsectionTitle}>Clubs</Text>

                    <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Cache hits:</Text>
                        <Text style={styles.statValue}>{stats?.clubs.hits || 0}</Text>
                    </View>

                    <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Cache misses:</Text>
                        <Text style={styles.statValue}>{stats?.clubs.misses || 0}</Text>
                    </View>

                    <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Hit rate:</Text>
                        <Text style={styles.statValue}>{stats?.clubs.hitRate || 'N/A'}</Text>
                    </View>

                    <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Avg filter time:</Text>
                        <Text style={styles.statValue}>{stats?.clubs.averageFilterTime || 'N/A'}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.actionsContainer}>
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleRefreshCache}
                    disabled={refreshing}
                >
                    <Text style={styles.actionButtonText}>Refresh Cache</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionButton, styles.clearButton]}
                    onPress={handleClearCache}
                    disabled={refreshing}
                >
                    <Text style={styles.actionButtonText}>Clear Cache</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionButton, styles.resetButton]}
                    onPress={handleResetStatistics}
                    disabled={refreshing}
                >
                    <Text style={styles.actionButtonText}>Reset Statistics</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={loadStats}
                    disabled={refreshing}
                >
                    <Text style={styles.actionButtonText}>Refresh Stats</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#121212',
    },
    loadingText: {
        color: '#FFFFFF',
        marginTop: 10,
        fontSize: 16,
    },
    header: {
        padding: 20,
        backgroundColor: '#D35400',
    },
    headerText: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    subHeaderText: {
        fontSize: 16,
        color: '#FFFFFF',
        opacity: 0.8,
    },
    refreshingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        backgroundColor: '#333333',
    },
    refreshingText: {
        color: '#FFFFFF',
        marginLeft: 10,
    },
    section: {
        margin: 15,
        padding: 15,
        backgroundColor: '#222222',
        borderRadius: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
        paddingBottom: 5,
    },
    subsection: {
        marginTop: 15,
        marginBottom: 10,
    },
    subsectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#D35400',
        marginBottom: 10,
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 5,
    },
    statLabel: {
        color: '#CCCCCC',
        fontSize: 14,
    },
    statValue: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '500',
    },
    actionsContainer: {
        margin: 15,
        marginTop: 5,
    },
    actionButton: {
        backgroundColor: '#D35400',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 10,
    },
    clearButton: {
        backgroundColor: '#FF5252',
    },
    resetButton: {
        backgroundColor: '#444444',
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default VenueCacheDebugScreen;