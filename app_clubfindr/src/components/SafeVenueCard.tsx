import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import VenueCard from './VenueCard';
import { Venue, Event } from '../services/discoveryService';
import { colors } from '../theme';

type SafeVenueCardProps = {
    /** Whatever the matching endpoints answered for one venue: not trusted, sanitised below */
    venue: unknown;
    onPress: (venue: Venue) => void;
};

type Loose = Record<string, unknown>;
const asText = (value: unknown) => (typeof value === 'string' ? value : String(value || ''));
const sanitizeArtist = (artist: unknown) => {
    const a = (artist ?? {}) as Loose;
    return { id: String(a.id || ''), name: String(a.name || '') };
};

// Helper function to sanitize an event
const sanitizeEvent = (event: Loose): Event => {
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
            ? event.special_genres.map(asText)
            : [],
        artists: Array.isArray(event.artists) ? event.artists.map(sanitizeArtist) : undefined
    };
};

// A safe wrapper for VenueCard that sanitizes malformed data
const SafeVenueCard = ({ venue: raw, onPress }: SafeVenueCardProps) => {
    // Guard against null/undefined venue
    if (!raw || typeof raw !== 'object') {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Invalid venue data</Text>
            </View>
        );
    }

    const venue = raw as Loose;
    const track = (venue.currentTrack ?? null) as Loose | null;

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
            ? venue.genres.map(asText)
            : [],
        topGenres: Array.isArray(venue.topGenres)
            ? venue.topGenres.map(asText)
            : undefined,

        // Club-specific fields
        event_name: typeof venue.event_name === 'string' ? venue.event_name : undefined,
        event_date: typeof venue.event_date === 'string' ? venue.event_date : undefined,
        start_time: typeof venue.start_time === 'string' ? venue.start_time : undefined,
        end_time: typeof venue.end_time === 'string' ? venue.end_time : undefined,
        price: typeof venue.price === 'string' ? venue.price : undefined,
        popularity: typeof venue.popularity === 'string' ? venue.popularity : undefined,
        
        // Artists for clubs
        artists: Array.isArray(venue.artists) ? venue.artists.map(sanitizeArtist) : undefined,

        // Current track for bars
        currentTrack: track ? { name: asText(track.name), artist: asText(track.artist) } : undefined,

        // Events array
        events: Array.isArray(venue.events)
            ? venue.events.map((event: unknown) => sanitizeEvent((event ?? {}) as Loose))
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
        backgroundColor: colors.card,
        borderRadius: 8,
        marginBottom: 10,
    },
    errorText: {
        color: colors.danger,
        fontSize: 14,
    }
});

export default SafeVenueCard;
