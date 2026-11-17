/**
 * "Genres you play" for the venue's Music tab: the app's side of the web dashboard's section
 * (`routes/bars/VenueGenresSection.svelte`). A venue names its genres outright, no artist needed,
 * and they count towards matching like the genres of its artists. Each add or remove saves at once,
 * as on the web; the server refuses genres its matcher does not know and says which.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { errorMessage, venueGenresApi } from '../services/tasteService';
import { errorStatus } from '../types/api';
import { MAX_VENUE_GENRES, genreVocabulary, normalizeGenre, suggestGenres } from '../utils/genreVocabulary';
import { colors } from '../theme';

type Props = { barId: string };

const VenueGenresEditor = ({ barId }: Props) => {
    const api = useMemo(() => venueGenresApi(barId), [barId]);
    const vocabulary = useMemo(() => genreVocabulary(), []);

    const [genres, setGenres] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [input, setInput] = useState('');
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

    const save = async (next: string[]) => {
        setSaving(true);
        setMessage('');
        try {
            setGenres(await api.save(next));
            setInput('');
        } catch (error) {
            const status = errorStatus(error);
            setMessage(
                status === 401 || status === 403
                    ? 'Your venue session has ended. Please log in again.'
                    : errorMessage(error, 'Could not save the genres. Please try again.')
            );
        } finally {
            setSaving(false);
        }
    };

    const atMax = genres.length >= MAX_VENUE_GENRES;

    const add = (genre: string) => {
        const wanted = genre.trim();
        if (!wanted || saving || atMax) return;
        if (genres.some((existing) => normalizeGenre(existing) === normalizeGenre(wanted))) {
            setInput('');
            return;
        }
        save([...genres, wanted]);
    };

    const remove = (genre: string) => {
        if (saving) return;
        save(genres.filter((existing) => existing !== genre));
    };

    const suggestions = atMax ? [] : suggestGenres(input, genres, vocabulary);

    return (
        <View style={styles.container} testID="venue-genres">
            <Text style={styles.title}>Genres you play</Text>
            <Text style={styles.intro}>
                Name the genres of your nights outright, no artist needed. They count towards matching
                exactly like the genres of your artists.
            </Text>

            {loading ? (
                <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : loadFailed ? null : genres.length === 0 ? (
                <Text style={styles.muted} testID="venue-genres-empty">
                    No genres yet. Add the first one below.
                </Text>
            ) : (
                <View style={styles.chips}>
                    {genres.map((genre) => (
                        <View key={genre} style={styles.chip} testID="venue-genre">
                            <Text style={styles.chipText}>{genre}</Text>
                            <TouchableOpacity
                                onPress={() => remove(genre)}
                                disabled={saving}
                                accessibilityRole="button"
                                accessibilityLabel={`Remove ${genre}`}
                                hitSlop={8}
                            >
                                <Text style={styles.chipText}> ✕</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}

            {!loading && !loadFailed && (
                <>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            value={input}
                            onChangeText={setInput}
                            onSubmitEditing={() => add(input)}
                            placeholder={atMax ? `Up to ${MAX_VENUE_GENRES} genres` : 'e.g. techno, soul, uk garage…'}
                            placeholderTextColor={colors.textMuted}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="done"
                            editable={!saving && !atMax}
                            testID="venue-genre-input"
                        />
                        <TouchableOpacity
                            style={[styles.addButton, (saving || atMax || !input.trim()) && styles.addButtonDisabled]}
                            onPress={() => add(input)}
                            disabled={saving || atMax || !input.trim()}
                            accessibilityRole="button"
                            testID="venue-genre-add"
                        >
                            {saving ? (
                                <ActivityIndicator size="small" color={colors.onPrimary} />
                            ) : (
                                <Text style={styles.addButtonText}>Add</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {suggestions.length > 0 && (
                        <View style={styles.suggestions}>
                            {suggestions.map((suggestion) => (
                                <TouchableOpacity
                                    key={suggestion}
                                    style={styles.suggestion}
                                    onPress={() => add(suggestion)}
                                    disabled={saving}
                                    testID="venue-genre-suggestion"
                                >
                                    <Text style={styles.suggestionText}>{suggestion}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    <Text style={styles.muted}>
                        {genres.length} of {MAX_VENUE_GENRES}
                    </Text>
                </>
            )}

            {message ? (
                <Text style={styles.error} testID="venue-genres-message">
                    {message}
                </Text>
            ) : null}
            {loadFailed && !loading && (
                <TouchableOpacity style={styles.retryButton} onPress={load} accessibilityRole="button" testID="venue-genres-retry">
                    <Text style={styles.addButtonText}>Try again</Text>
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
    muted: {
        color: colors.textMuted,
        fontSize: 13,
        marginVertical: 8,
    },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.primary,
        borderRadius: 16,
        paddingVertical: 6,
        paddingHorizontal: 12,
        marginRight: 8,
        marginBottom: 8,
    },
    chipText: {
        color: colors.onPrimary,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    input: {
        flex: 1,
        backgroundColor: colors.card,
        color: colors.text,
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginRight: 8,
    },
    addButton: {
        backgroundColor: colors.primary,
        borderRadius: 6,
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    addButtonDisabled: {
        opacity: 0.5,
    },
    addButtonText: {
        color: colors.onPrimary,
        fontWeight: '600',
    },
    suggestions: {
        backgroundColor: colors.surface,
        borderRadius: 6,
        marginTop: 6,
    },
    suggestion: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    suggestionText: {
        color: colors.text,
    },
    retryButton: {
        alignSelf: 'flex-start',
        backgroundColor: colors.primary,
        borderRadius: 6,
        paddingVertical: 10,
        paddingHorizontal: 16,
        marginTop: 10,
    },
    error: {
        color: colors.danger,
        fontSize: 13,
        fontWeight: '600',
        marginTop: 8,
    },
});

export default VenueGenresEditor;
