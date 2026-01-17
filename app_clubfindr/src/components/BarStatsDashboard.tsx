// Create a new file called BarStatsDashboard.tsx in your components folder

import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface BarStat {
    label: string;
    value: string | number;
    change?: string;
    isPositive?: boolean;
}

interface BarStatsDashboardProps {
    loading: boolean;
    topGenres: Array<{ genre: string; count: number }>;
    visitorsToday?: number;
    visitorsWeek?: number;
    compareToLastWeek?: number;
    matchedUsers?: number;
    onRefresh: () => void;
}

const BarStatsDashboard: React.FC<BarStatsDashboardProps> = ({
    loading,
    topGenres,
    visitorsToday = 0,
    visitorsWeek = 0,
    compareToLastWeek = 0,
    matchedUsers = 0,
    onRefresh
}) => {
    const stats: BarStat[] = [
        {
            label: 'Today\'s Visitors',
            value: visitorsToday
        },
        {
            label: 'This Week',
            value: visitorsWeek,
            change: `${Math.abs(compareToLastWeek)}%`,
            isPositive: compareToLastWeek >= 0
        },
        {
            label: 'Genre Matches',
            value: matchedUsers
        }
    ];

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#D35400" />
                <Text style={styles.loadingText}>Loading dashboard...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Dashboard</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
                    <Ionicons name="refresh" size={20} color="#FFFFFF" />
                </TouchableOpacity>
            </View>

            {/* Stats Cards */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScrollView}>
                {stats.map((stat, index) => (
                    <View key={index} style={styles.statCard}>
                        <Text style={styles.statValue}>{stat.value}</Text>
                        <Text style={styles.statLabel}>{stat.label}</Text>
                        {stat.change && (
                            <View style={styles.changeRow}>
                                <Ionicons
                                    name={stat.isPositive ? 'arrow-up' : 'arrow-down'}
                                    size={12}
                                    color={stat.isPositive ? '#4CAF50' : '#F44336'}
                                />
                                <Text
                                    style={[
                                        styles.changeText,
                                        { color: stat.isPositive ? '#4CAF50' : '#F44336' }
                                    ]}
                                >
                                    {stat.change}
                                </Text>
                            </View>
                        )}
                    </View>
                ))}
            </ScrollView>

            {/* Top Genres */}
            <View style={styles.genresSection}>
                <Text style={styles.genresSectionTitle}>Current Genre Profile</Text>
                {topGenres.length > 0 ? (
                    <View style={styles.genresContainer}>
                        {topGenres.slice(0, 5).map((genre, index) => (
                            <View key={index} style={styles.genreRow}>
                                <Text style={styles.genreName}>{genre.genre}</Text>
                                <View style={styles.genreBarContainer}>
                                    <View
                                        style={[
                                            styles.genreBar,
                                            {
                                                width: `${Math.min(
                                                    100,
                                                    (genre.count / Math.max(...topGenres.map(g => g.count))) * 100
                                                )}%`
                                            }
                                        ]}
                                    />
                                </View>
                                <Text style={styles.genreCount}>{genre.count}</Text>
                            </View>
                        ))}
                    </View>
                ) : (
                    <Text style={styles.noDataText}>No genre data available</Text>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1E1E1E',
        borderRadius: 8,
        padding: 15,
        marginBottom: 15,
    },
    loadingContainer: {
        backgroundColor: '#1E1E1E',
        borderRadius: 8,
        padding: 15,
        marginBottom: 15,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
    },
    loadingText: {
        color: '#CCCCCC',
        marginTop: 10,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    refreshButton: {
        padding: 5,
    },
    statsScrollView: {
        marginBottom: 20,
    },
    statCard: {
        backgroundColor: '#2A2A2A',
        borderRadius: 8,
        padding: 15,
        marginRight: 10,
        width: 140,
        height: 100,
        justifyContent: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 5,
    },
    statLabel: {
        fontSize: 14,
        color: '#CCCCCC',
    },
    changeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 5,
    },
    changeText: {
        fontSize: 12,
        marginLeft: 2,
    },
    genresSection: {
        borderTopWidth: 1,
        borderTopColor: '#333333',
        paddingTop: 15,
    },
    genresSectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 10,
    },
    genresContainer: {
        marginTop: 10,
    },
    genreRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    genreName: {
        color: '#FFFFFF',
        width: 80,
        fontSize: 14,
    },
    genreBarContainer: {
        flex: 1,
        height: 12,
        backgroundColor: '#333333',
        borderRadius: 6,
        marginHorizontal: 10,
        overflow: 'hidden',
    },
    genreBar: {
        height: '100%',
        backgroundColor: '#D35400',
        borderRadius: 6,
    },
    genreCount: {
        color: '#FFFFFF',
        width: 30,
        textAlign: 'right',
        fontSize: 14,
    },
    noDataText: {
        color: '#CCCCCC',
        textAlign: 'center',
        fontStyle: 'italic',
        padding: 15,
    },
});

export default BarStatsDashboard;