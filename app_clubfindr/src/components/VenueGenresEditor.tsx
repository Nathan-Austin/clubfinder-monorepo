/**
 * "Genres you play" for the venue's Music tab: the app's side of the web dashboard's section
 * (`routes/bars/VenueGenresSection.svelte`). A venue names its genres outright, no artist needed,
 * and they count towards matching like the genres of its artists. Each add or remove saves at once,
 * as on the web; the server refuses genres its matcher does not know and says which.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { errorMessage, venueGenresApi } from '../services/tasteService';
import { errorStatus } from '../types/api';
import { MAX_VENUE_GENRES } from '../utils/genreVocabulary';
import GenreChipsInput from './GenreChipsInput';
import { colors } from '../theme';

type Props = { barId: string };

const VenueGenresEditor = ({ barId }: Props) => {
    const api = useMemo(() => venueGenresApi(barId), [barId]);

    const [genres, setGenres] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [loadFailed, setLoadFailed] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');
        setLoadFailed(false);
        try {
            setGenres(await api.list());
        } catch (error) {
            setLoadFailed(true);
            setMessage(errorMessage(error, 'Could not load your genres.'));
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        load();
    }, [load]);

    /** PUT replaces the set; true when the server took it */
    const save = async (next: string[]): Promise<boolean> => {
        setSaving(true);
        setMessage('');
        try {
            setGenres(await api.save(next));
            return true;
        } catch (error) {
            const status = errorStatus(error);
            setMessage(
                status === 401 || status === 403
                    ? 'Your venue session has ended. Please log in again.'
                    : errorMessage(error, 'Could not save the genres. Please try again.')
            );
            return false;
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={styles.container} testID="venue-genres">
            <Text style={styles.title}>Genres you play</Text>
            <Text style={styles.intro}>
                Name the genres of your nights outright, no artist needed. They count towards matching
                exactly like the genres of your artists.
            </Text>

            {loading ? (
                <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : loadFailed ? null : (
                <GenreChipsInput
                    genres={genres}
                    onAdd={(genre) => save([...genres, genre])}
                    onRemove={(genre) => {
                        save(genres.filter((existing) => existing !== genre));
                    }}
                    busy={saving}
                    max={MAX_VENUE_GENRES}
                    emptyText="No genres yet. Add the first one below."
                    testIDPrefix="venue-genre"
                />
            )}

            {message ? (
                <Text style={styles.error} testID="venue-genres-message">
                    {message}
                </Text>
            ) : null}
            {loadFailed && !loading && (
                <TouchableOpacity style={styles.retryButton} onPress={load} accessibilityRole="button" testID="venue-genres-retry">
                    <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 16,
    },
    title: {
        color: colors.text,
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 6,
    },
    intro: {
        color: colors.textMuted,
        fontSize: 14,
        marginBottom: 14,
    },
    loader: {
        marginVertical: 20,
    },
    retryButton: {
        alignSelf: 'flex-start',
        backgroundColor: colors.primary,
        borderRadius: 6,
        paddingVertical: 10,
        paddingHorizontal: 16,
        marginTop: 10,
    },
    retryText: {
        color: colors.onPrimary,
        fontWeight: '600',
    },
    error: {
        color: colors.danger,
        fontSize: 13,
        fontWeight: '600',
        marginTop: 8,
    },
});

export default VenueGenresEditor;
