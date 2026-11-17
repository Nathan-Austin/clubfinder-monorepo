/**
 * The venue side's Music tab (ROADMAP "Venue side of the app", step 7): what a venue plays, in
 * two parts that both feed matching.
 * - Artists: the artist picker in venue mode, as the Artists tab had it (the tab's
 *   `initialParams` give it `mode: 'venue'`)
 * - Genres: "Genres you play" (`components/VenueGenresEditor`), until now only on the web
 *
 * A switch between the two rather than one long screen: the picker scrolls on its own, and a
 * scroll view inside another one does not work on Android.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ArtistPickerScreen from './ArtistPickerScreen';
import VenueGenresEditor from '../components/VenueGenresEditor';
import { colors } from '../theme';

type Part = 'artists' | 'genres';

const PARTS: { key: Part; label: string }[] = [
    { key: 'artists', label: 'Artists' },
    { key: 'genres', label: 'Genres' },
];

const VenueMusicScreen = () => {
    const [part, setPart] = useState<Part>('artists');
    const [barId, setBarId] = useState<string | null | undefined>(undefined);

    // Stored at venue login (AuthContext.barLogin), like the artist picker reads it
    useEffect(() => {
        AsyncStorage.getItem('barId').then(setBarId);
    }, []);

    return (
        <View style={styles.container}>
            <View style={styles.switch} accessibilityRole="tablist">
                {PARTS.map(({ key, label }) => (
                    <TouchableOpacity
                        key={key}
                        style={[styles.switchOption, part === key && styles.switchOptionActive]}
                        onPress={() => setPart(key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: part === key }}
                        testID={`venue-music-${key}`}
                    >
                        <Text style={[styles.switchText, part === key && styles.switchTextActive]}>{label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {part === 'artists' ? (
                <ArtistPickerScreen />
            ) : barId === undefined ? null : barId ? (
                <ScrollView keyboardShouldPersistTaps="handled">
                    <VenueGenresEditor barId={barId} />
                </ScrollView>
            ) : (
                <Text style={styles.error}>
                    We could not tell which venue you are logged in as. Please log in again.
                </Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    switch: {
        flexDirection: 'row',
        margin: 12,
        marginBottom: 0,
        borderRadius: 8,
        backgroundColor: colors.card,
        padding: 3,
    },
    switchOption: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 9,
        borderRadius: 6,
    },
    switchOptionActive: {
        backgroundColor: colors.primary,
    },
    switchText: {
        color: colors.textMuted,
        fontWeight: '600',
    },
    switchTextActive: {
        color: colors.onPrimary,
    },
    error: {
        color: colors.danger,
        padding: 16,
    },
});

export default VenueMusicScreen;
