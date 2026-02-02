import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import VenueCard from './VenueCard';
import { Venue, Event } from '../services/discoveryService';

type SafeVenueCardProps = {
    venue: any;
    onPress: (venue: Venue) => void;
};

// Helper function to sanitize an event
const sanitizeEvent = (event: Record<string, any>): Event => {
    return {
        id: String(event.id || Math.random()),
        theme_name: typeof event.theme_name === 'string' ? event.theme_name : String(event.theme_name || ''),
        description: typeof event.description === 'string' ? event.description : undefined,
        event_date: typeof event.event_date === 'string' ? event.event_date : '',
        start_time: typeof event.start_time === 'string' ? event.start_time : undefined,
        end_time: typeof event.end_time === 'string' ? event.end_time : undefined,
        recurring: typeof event.recurring === 'boolean' ? event.recurring : false,
        recurrence_pattern: typeof event.recurrence_pattern === 'string' ? event.recurrence_pattern : undefined,
        special_genres: Array.isArray(event.special_genres)
            ? event.special_genres.map((g: any) => typeof g === 'string' ? g : String(g || ''))
            : [],
        artists: Array.isArray(event.artists)
            ? event.artists.map((a: any) => ({
                id: String(a.id || ''),
                name: String(a.name || '')
            }))
            : undefined
    };
};

// A safe wrapper for VenueCard that sanitizes malformed data
const SafeVenueCard = ({ venue, onPress }: SafeVenueCardProps) => {
    // Guard against null/undefined venue
    if (!venue) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Invalid venue data</Text>
            </View>
        );
    }

    // Create a sanitized venue object with proper types for all fields
    const sanitizedVenue: Venue = {
        id: String(venue.id || Math.random()),
        name: typeof venue.name === 'string' ? venue.name : String(venue.name || ''),
        club_name: typeof venue.club_name === 'string' ? venue.club_name : undefined,
        address: typeof venue.address === 'string' ? venue.address : String(venue.address || ''),
        venueType: venue.venueType === 'club' ? 'club' : 'bar',
        distance: typeof venue.distance === 'number' && !isNaN(venue.distance) ? venue.distance : undefined,
        similarity: typeof venue.similarity === 'number' && !isNaN(venue.similarity) ? venue.similarity : undefined,
        genres: Array.isArray(venue.genres)
            ? venue.genres.map((g: any) => typeof g === 'string' ? g : String(g || ''))
            : [],
        topGenres: Array.isArray(venue.topGenres)
            ? venue.topGenres.map((g: any) => typeof g === 'string' ? g : String(g || ''))
            : undefined,

        // Club-specific fields
        event_name: typeof venue.event_name === 'string' ? venue.event_name : undefined,
        event_date: typeof venue.event_date === 'string' ? venue.event_date : undefined,
        start_time: typeof venue.start_time === 'string' ? venue.start_time : undefined,
        end_time: typeof venue.end_time === 'string' ? venue.end_time : undefined,
        price: typeof venue.price === 'string' ? venue.price : undefined,
        popularity: typeof venue.popularity === 'string' ? venue.popularity : undefined,
        
        // Artists for clubs
        artists: Array.isArray(venue.artists)
            ? venue.artists.map((a: any) => ({
                id: String(a.id || ''),
                name: String(a.name || '')
            }))
            : undefined,

        // Current track for bars
        currentTrack: venue.currentTrack ? {
            name: typeof venue.currentTrack.name === 'string' ? venue.currentTrack.name : String(venue.currentTrack.name || ''),
            artist: typeof venue.currentTrack.artist === 'string' ? venue.currentTrack.artist : String(venue.currentTrack.artist || '')
        } : undefined,

        // Events array
        events: Array.isArray(venue.events)
            ? venue.events.map((event: Record<string, any>) => sanitizeEvent(event))
            : undefined
    };

    // Safe onPress handler
    const handlePress = () => {
        if (typeof onPress === 'function') {
            onPress(sanitizedVenue);
        }
    };

    return <VenueCard venue={sanitizedVenue} onPress={handlePress} />;
};

const styles = StyleSheet.create({
    errorContainer: {
        padding: 16,
        backgroundColor: '#2A2A2A',
        borderRadius: 8,
        marginBottom: 10,
    },
    errorText: {
        color: '#FF5252',
        fontSize: 14,
    }
});

export default SafeVenueCard;
