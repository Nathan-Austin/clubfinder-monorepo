import AsyncStorage from '@react-native-async-storage/async-storage';
import VenueCache from './VenueCache';

// Keys for monitoring
const VENUE_CACHE_HITS = 'venue_cache_hits';
const VENUE_CACHE_MISSES = 'venue_cache_misses';
const VENUE_CACHE_FILTER_TIME = 'venue_cache_filter_time';

/**
 * Utility to monitor venue cache performance
 */
export default class VenueCacheMonitor {
    /**
     * Record a cache hit
     */
    static async recordCacheHit(venueType: 'bar' | 'club'): Promise<void> {
        try {
            const key = `${VENUE_CACHE_HITS}_${venueType}`;
            const hits = await AsyncStorage.getItem(key);
            const newHits = hits ? parseInt(hits) + 1 : 1;
            await AsyncStorage.setItem(key, newHits.toString());
        } catch (error) {
            console.error('Error recording cache hit:', error);
        }
    }

    /**
     * Record a cache miss
     */
    static async recordCacheMiss(venueType: 'bar' | 'club'): Promise<void> {
        try {
            const key = `${VENUE_CACHE_MISSES}_${venueType}`;
            const misses = await AsyncStorage.getItem(key);
            const newMisses = misses ? parseInt(misses) + 1 : 1;
            await AsyncStorage.setItem(key, newMisses.toString());
        } catch (error) {
            console.error('Error recording cache miss:', error);
        }
    }

    /**
     * Record filter operation time
     */
    static async recordFilterTime(venueType: 'bar' | 'club', timeMs: number): Promise<void> {
        try {
            const key = `${VENUE_CACHE_FILTER_TIME}_${venueType}`;
            const times = await AsyncStorage.getItem(key);

            // Store as comma-separated list of times (most recent first)
            const timesList = times ? times.split(',') : [];
            timesList.unshift(timeMs.toString());

            // Keep only last 10 times
            const newTimesList = timesList.slice(0, 10);

            await AsyncStorage.setItem(key, newTimesList.join(','));
        } catch (error) {
            console.error('Error recording filter time:', error);
        }
    }

    /**
     * Get cache statistics
     */
    static async getStatistics(): Promise<{
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
    }> {
        try {
            // Get hits and misses for bars
            const barHits = parseInt(await AsyncStorage.getItem(`${VENUE_CACHE_HITS}_bar`) || '0');
            const barMisses = parseInt(await AsyncStorage.getItem(`${VENUE_CACHE_MISSES}_bar`) || '0');
            const barTotal = barHits + barMisses;
            const barHitRate = barTotal > 0 ? `${(barHits / barTotal * 100).toFixed(1)}%` : 'N/A';

            // Get hits and misses for clubs
            const clubHits = parseInt(await AsyncStorage.getItem(`${VENUE_CACHE_HITS}_club`) || '0');
            const clubMisses = parseInt(await AsyncStorage.getItem(`${VENUE_CACHE_MISSES}_club`) || '0');
            const clubTotal = clubHits + clubMisses;
            const clubHitRate = clubTotal > 0 ? `${(clubHits / clubTotal * 100).toFixed(1)}%` : 'N/A';

            // Get filter times for bars
            const barTimesStr = await AsyncStorage.getItem(`${VENUE_CACHE_FILTER_TIME}_bar`) || '';
            const barTimes = barTimesStr ? barTimesStr.split(',').map(t => parseInt(t)) : [];
            const barAvgFilterTime = barTimes.length > 0
                ? `${(barTimes.reduce((sum, t) => sum + t, 0) / barTimes.length).toFixed(1)}ms`
                : 'N/A';

            // Get filter times for clubs
            const clubTimesStr = await AsyncStorage.getItem(`${VENUE_CACHE_FILTER_TIME}_club`) || '';
            const clubTimes = clubTimesStr ? clubTimesStr.split(',').map(t => parseInt(t)) : [];
            const clubAvgFilterTime = clubTimes.length > 0
                ? `${(clubTimes.reduce((sum, t) => sum + t, 0) / clubTimes.length).toFixed(1)}ms`
                : 'N/A';

            // Get cache ages
            const barCacheAge = await VenueCache.getCacheAge('bar');
            const clubCacheAge = await VenueCache.getCacheAge('club');

            return {
                bars: {
                    hits: barHits,
                    misses: barMisses,
                    hitRate: barHitRate,
                    averageFilterTime: barAvgFilterTime,
                    cacheAge: barCacheAge !== null ? `${barCacheAge} minutes` : 'No cache'
                },
                clubs: {
                    hits: clubHits,
                    misses: clubMisses,
                    hitRate: clubHitRate,
                    averageFilterTime: clubAvgFilterTime,
                    cacheAge: clubCacheAge !== null ? `${clubCacheAge} minutes` : 'No cache'
                }
            };
        } catch (error) {
            console.error('Error getting cache statistics:', error);
            return {
                bars: {
                    hits: 0,
                    misses: 0,
                    hitRate: 'Error',
                    averageFilterTime: 'Error',
                    cacheAge: 'Error'
                },
                clubs: {
                    hits: 0,
                    misses: 0,
                    hitRate: 'Error',
                    averageFilterTime: 'Error',
                    cacheAge: 'Error'
                }
            };
        }
    }

    /**
     * Reset all statistics
     */
    static async resetStatistics(): Promise<void> {
        try {
            await AsyncStorage.removeItem(`${VENUE_CACHE_HITS}_bar`);
            await AsyncStorage.removeItem(`${VENUE_CACHE_HITS}_club`);
            await AsyncStorage.removeItem(`${VENUE_CACHE_MISSES}_bar`);
            await AsyncStorage.removeItem(`${VENUE_CACHE_MISSES}_club`);
            await AsyncStorage.removeItem(`${VENUE_CACHE_FILTER_TIME}_bar`);
            await AsyncStorage.removeItem(`${VENUE_CACHE_FILTER_TIME}_club`);
            console.log('Cache statistics reset');
        } catch (error) {
            console.error('Error resetting cache statistics:', error);
        }
    }
}