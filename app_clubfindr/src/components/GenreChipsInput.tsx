/**
 * Chosen genres as chips, and a field that suggests more from the shared genre vocabulary
 * (`utils/genreVocabulary`, the web dashboard's list). Used by the venue's "Genres you play"
 * (`VenueGenresEditor`, which saves each change) and the event form (which saves with the event).
 *
 * Any typed text can be added, but the server accepts only the names in that list (event genres
 * are strict since 2026-11-19, KNOWN_ISSUES 91), so a chip the server would refuse is shown in
 * amber with the reason while it is still on the screen, instead of a refusal after Save
 * (DEVICE_CHECKLIST 2026-11-19, section 6; owner's decision: inline). A genre already chosen,
 * in any case or spacing, is not added twice.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { genreVocabulary, isKnownGenre, normalizeGenre, suggestGenres, unknownGenres } from '../utils/genreVocabulary';
import { colors } from '../theme';

type Props = {
    genres: readonly string[];
    /** Resolves true when the genre was taken; the field is cleared then, kept otherwise */
    onAdd: (genre: string) => boolean | Promise<boolean>;
    onRemove: (genre: string) => void;
    /** A save in flight: no changes, a spinner on Add */
    busy?: boolean;
    /** At most this many genres (the venue's declared genres: 15) */
    max?: number;
    placeholder?: string;
    emptyText?: string;
    /** testID prefix: `${p}-input`, `${p}-add`, `${p}-suggestion`, `${p}` on each chip */
    testIDPrefix?: string;
};

const GenreChipsInput = ({
    genres,
    onAdd,
    onRemove,
    busy = false,
    max,
    placeholder = 'e.g. techno, soul, uk garage…',
    emptyText,
    testIDPrefix = 'genre',
}: Props) => {
    const vocabulary = useMemo(() => genreVocabulary(), []);
    const [input, setInput] = useState('');

    const atMax = max !== undefined && genres.length >= max;
    const canAdd = !busy && !atMax && input.trim().length > 0;
    const suggestions = atMax ? [] : suggestGenres(input, genres, vocabulary);
    const unknown = unknownGenres(genres, vocabulary);
    const typedUnknown = input.trim().length > 0 && !isKnownGenre(input, vocabulary);

    const add = async (genre: string) => {
        const wanted = genre.trim();
        if (!wanted || busy || atMax) return;
        if (genres.some((existing) => normalizeGenre(existing) === normalizeGenre(wanted))) {
            setInput('');
            return;
        }
        if (await onAdd(wanted)) setInput('');
    };

    return (
        <View>
            {genres.length === 0 ? (
                emptyText ? (
                    <Text style={styles.muted} testID={`${testIDPrefix}s-empty`}>
                        {emptyText}
                    </Text>
                ) : null
            ) : (
                <View style={styles.chips}>
                    {genres.map((genre) => {
                        const known = isKnownGenre(genre, vocabulary);
                        return (
                            <View
                                key={genre}
                                style={[styles.chip, !known && styles.chipUnknown]}
                                testID={known ? testIDPrefix : `${testIDPrefix}-unknown`}
                                accessibilityLabel={known ? genre : `${genre}, not a genre Clubfindr knows`}
                            >
                                <Text style={[styles.chipText, !known && styles.chipUnknownText]}>
                                    {known ? genre : `${genre} ?`}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => onRemove(genre)}
                                    disabled={busy}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${genre}`}
                                    hitSlop={8}
                                >
                                    <Text style={[styles.chipText, !known && styles.chipUnknownText]}> ✕</Text>
                                </TouchableOpacity>
                            </View>
                        );
                    })}
                </View>
            )}
            {unknown.length > 0 && (
                <Text style={styles.unknownNote} testID={`${testIDPrefix}s-unknown-note`}>
                    {unknown.length === 1
                        ? `"${unknown[0]}" is not a genre Clubfindr knows, so it cannot be saved. Remove it, or pick a suggestion.`
                        : `Not genres Clubfindr knows, so they cannot be saved: ${unknown.join(', ')}. Remove them, or pick suggestions.`}
                </Text>
            )}

            <View style={styles.inputRow}>
                <TextInput
                    style={styles.input}
                    value={input}
                    onChangeText={setInput}
                    onSubmitEditing={() => add(input)}
                    placeholder={atMax ? `Up to ${max} genres` : placeholder}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    editable={!busy && !atMax}
                    testID={`${testIDPrefix}-input`}
                />
                <TouchableOpacity
                    style={[styles.addButton, !canAdd && styles.addButtonDisabled]}
                    onPress={() => add(input)}
                    disabled={!canAdd}
                    accessibilityRole="button"
                    testID={`${testIDPrefix}-add`}
                >
                    {busy ? (
                        <ActivityIndicator size="small" color={colors.onPrimary} />
                    ) : (
                        <Text style={styles.addButtonText}>Add</Text>
                    )}
                </TouchableOpacity>
            </View>

            {typedUnknown && suggestions.length === 0 && (
                <Text style={styles.unknownNote} testID={`${testIDPrefix}-typed-unknown`}>
                    No genre called "{input.trim()}" in Clubfindr's list. Try another spelling, or a wider name.
                </Text>
            )}

            {suggestions.length > 0 && (
                <View style={styles.suggestions}>
                    {suggestions.map((suggestion) => (
                        <TouchableOpacity
                            key={suggestion}
                            style={styles.suggestion}
                            onPress={() => add(suggestion)}
                            disabled={busy}
                            testID={`${testIDPrefix}-suggestion`}
                        >
                            <Text style={styles.suggestionText}>{suggestion}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {max !== undefined && (
                <Text style={styles.muted}>
                    {genres.length} of {max}
                </Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
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
    /* A genre the server would refuse: amber, dark text, a question mark */
    chipUnknown: {
        backgroundColor: colors.warning,
    },
    chipUnknownText: {
        color: colors.textOnLight,
    },
    unknownNote: {
        color: colors.warning,
        fontSize: 13,
        marginBottom: 8,
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
});

export default GenreChipsInput;
