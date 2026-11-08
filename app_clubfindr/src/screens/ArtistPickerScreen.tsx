/**
 * Artist picker: the app's counterpart of the web's ArtistPicker.svelte, in three modes.
 *
 *   onboarding  after login, while the server says user.artistOnboarding.required: pick 3 to 5
 *               artists whose genres become the taste profile. Continue unlocks at 3; Skip is
 *               always there. Shown by RootNavigator in place of the tabs until finished.
 *   profile     the same list from the Profile tab, with no cap.
 *   venue       a bar manager's "artists you play" (/api/venues/:barId/taste).
 *
 * The 5 is a quick-start cap for onboarding only and is advisory, as on the web: at 5 the Add
 * buttons are disabled and the note points to the profile for more. The server's only hard
 * limit is 50.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import {
    errorMessage,
    MIN_QUERY_LENGTH,
    PickedArtist,
    SearchHit,
    tasteApi,
    USER_TASTE_BASE,
    venueTasteBase
} from '../services/tasteService';

export type ArtistPickerMode = 'onboarding' | 'profile' | 'venue';
export type ArtistPickerParams = { mode: ArtistPickerMode; barId?: string };

const SEARCH_DEBOUNCE_MS = 300;
/** Onboarding's quick-start range; the server's onboarding status repeats it */
const ONBOARDING_MIN = 3;
const ONBOARDING_MAX = 5;

const keyOf = (artist: { source: string; sourceId: string }) => `${artist.source}:${artist.sourceId}`;

const ArtistPickerScreen = () => {
    const route = useRoute<RouteProp<{ ArtistPicker: ArtistPickerParams }, 'ArtistPicker'>>();
    const mode: ArtistPickerMode = route.params?.mode ?? 'profile';
    const { user, finishArtistOnboarding } = useAuth();

    const min = mode === 'onboarding' ? (user?.artistOnboarding?.min ?? ONBOARDING_MIN) : 0;
    const max = mode === 'onboarding' ? (user?.artistOnboarding?.max ?? ONBOARDING_MAX) : null;

    const [base, setBase] = useState<string | null>(mode === 'venue' ? null : USER_TASTE_BASE);
    const [artists, setArtists] = useState<PickedArtist[]>([]);
    const [genres, setGenres] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [warning, setWarning] = useState('');
    const [busy, setBusy] = useState<Set<string>>(new Set());
    const [finishing, setFinishing] = useState(false);

    const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const latestSearch = useRef(0);

    const atMax = max !== null && artists.length >= max;
    const complete = artists.length >= min;

    // Venue mode: the bar id is stored at bar login (AuthContext.barLogin)
    useEffect(() => {
        if (mode !== 'venue') return;
        (async () => {
            const barId = route.params?.barId ?? (await AsyncStorage.getItem('barId'));
            if (barId) setBase(venueTasteBase(barId));
            else {
                setError('We could not tell which venue you are logged in as. Please log in again.');
                setLoading(false);
            }
        })();
    }, [mode, route.params?.barId]);

    useEffect(() => {
        if (!base) return;
        let active = true;
        setLoading(true);
        tasteApi(base)
            .list()
            .then((profile) => {
                if (!active) return;
                setArtists(profile.artists);
                setGenres(profile.genres);
                setError('');
            })
            .catch((err) => active && setError(errorMessage(err, 'Could not load the artists')))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [base]);

    const runSearch = useCallback(
        async (value: string) => {
            if (!base) return;
            const id = ++latestSearch.current;
            setSearching(true);
            try {
                const data = await tasteApi(base).search(value);
                if (id !== latestSearch.current) return; // a newer search is in flight
                setResults(data.artists);
                setWarning(data.warning ?? '');
                setError('');
            } catch (err) {
                if (id !== latestSearch.current) return;
                setResults([]);
                setError(errorMessage(err, 'Search failed'));
            } finally {
                if (id === latestSearch.current) {
                    setSearching(false);
                    setSearched(true);
                }
            }
        },
        [base]
    );

    const onQueryChange = (text: string) => {
        setQuery(text);
        clearTimeout(searchTimer.current);
        if (text.trim().length < MIN_QUERY_LENGTH) {
            latestSearch.current += 1;
            setResults([]);
            setSearched(false);
            setSearching(false);
            setWarning('');
            return;
        }
        searchTimer.current = setTimeout(() => runSearch(text), SEARCH_DEBOUNCE_MS);
    };

    useEffect(() => () => clearTimeout(searchTimer.current), []);

    const setKeyBusy = (key: string, value: boolean) =>
        setBusy((previous: Set<string>) => {
            const next = new Set(previous);
            if (value) next.add(key);
            else next.delete(key);
            return next;
        });

    const addArtist = async (hit: SearchHit) => {
        const key = keyOf(hit);
        if (!base || busy.has(key) || atMax) return;
        setKeyBusy(key, true);
        setError('');
        try {
            const body = await tasteApi(base).add(hit);
            if (body.created) setArtists((list: PickedArtist[]) => [...list, body.artist]);
            setGenres(body.genres);
            setResults((list: SearchHit[]) =>
                list.map((r: SearchHit) =>
                    keyOf(r) === key ? { ...r, favourite: true, catalogueId: body.artist.id } : r
                )
            );
        } catch (err) {
            setError(errorMessage(err, `Could not add ${hit.name}`));
        } finally {
            setKeyBusy(key, false);
        }
    };

    const removeArtist = async (artist: PickedArtist) => {
        const key = keyOf(artist);
        if (!base || busy.has(key)) return;
        setKeyBusy(key, true);
        setError('');
        try {
            const body = await tasteApi(base).remove(artist.id);
            setArtists((list: PickedArtist[]) => list.filter((a: PickedArtist) => a.id !== artist.id));
            if (Array.isArray(body.genres)) setGenres(body.genres);
            setResults((list: SearchHit[]) =>
                list.map((r: SearchHit) => (keyOf(r) === key ? { ...r, favourite: false } : r))
            );
        } catch (err) {
            setError(errorMessage(err, `Could not remove ${artist.name}`));
        } finally {
            setKeyBusy(key, false);
        }
    };

    const finish = async () => {
        setFinishing(true);
        await finishArtistOnboarding();
    };

    const title =
        mode === 'onboarding'
            ? `Pick ${min} to ${max} artists you love`
            : mode === 'venue'
              ? 'Artists you play'
              : 'Your artists';
    const intro =
        mode === 'venue'
            ? 'Add the artists that describe your nights. Their genres are what people are matched against, no streaming account needed.'
            : 'Their genres become your taste profile, so we can find nights that suit you. No Spotify or other streaming account needed.';

    return (
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" testID="artist-picker">
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.muted}>{intro}</Text>

            {mode === 'onboarding' && (
                <Text style={styles.progress} testID="onboarding-progress">
                    {complete ? `${artists.length} picked. You are good to go.` : `${artists.length} of ${min} picked`}
                </Text>
            )}

            <TextInput
                style={styles.input}
                placeholder={mode === 'venue' ? 'Search for an artist you play…' : 'Search for an artist…'}
                placeholderTextColor="#888888"
                value={query}
                onChangeText={onQueryChange}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!!base}
                testID="taste-search"
            />

            {warning ? <Text style={styles.warning}>{warning}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {atMax && (
                <Text style={styles.muted} testID="taste-at-max">
                    That is plenty to get started. You can add as many more as you like later from your
                    profile, or import your listening history from Last.fm on the website.
                </Text>
            )}

            {searching ? (
                <ActivityIndicator color="#D35400" style={styles.spacer} />
            ) : searched && results.length === 0 ? (
                <Text style={styles.muted}>No artists found for “{query.trim()}”.</Text>
            ) : (
                <FlatList
                    data={results}
                    keyExtractor={keyOf}
                    scrollEnabled={false}
                    renderItem={({ item }: { item: SearchHit }) => (
                        <View style={styles.result} testID="taste-result">
                            {item.imageUrl ? (
                                <Image source={{ uri: item.imageUrl }} style={styles.avatar} />
                            ) : (
                                <View style={[styles.avatar, styles.avatarEmpty]}>
                                    <Text style={styles.avatarText}>♪</Text>
                                </View>
                            )}
                            <View style={styles.resultText}>
                                <Text style={styles.resultName}>{item.name}</Text>
                                <Text style={styles.resultGenres} numberOfLines={1}>
                                    {item.genres.length ? item.genres.join(', ') : 'no genres listed'}
                                </Text>
                            </View>
                            {item.favourite ? (
                                <Text style={styles.muted}>Added</Text>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.addButton, (busy.has(keyOf(item)) || atMax) && styles.disabled]}
                                    onPress={() => addArtist(item)}
                                    disabled={busy.has(keyOf(item)) || atMax}
                                    accessibilityLabel={`Add ${item.name}`}
                                >
                                    <Text style={styles.buttonText}>Add</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                />
            )}

            <Text style={styles.subtitle}>
                {mode === 'venue' ? 'Your artists' : 'Favourite artists'}
                {loading ? '' : ` (${artists.length})`}
            </Text>
            {loading ? (
                <ActivityIndicator color="#D35400" />
            ) : artists.length === 0 ? (
                <Text style={styles.muted}>No artists yet. Search above to add the first one.</Text>
            ) : (
                <View style={styles.chips}>
                    {artists.map((artist: PickedArtist) => (
                        <View key={artist.id} style={styles.chip} testID="taste-favourite">
                            <Text style={styles.chipText}>{artist.name}</Text>
                            <TouchableOpacity
                                onPress={() => removeArtist(artist)}
                                disabled={busy.has(keyOf(artist))}
                                accessibilityLabel={`Remove ${artist.name}`}
                                hitSlop={8}
                            >
                                <Text style={styles.chipText}> ✕</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}

            <Text style={styles.subtitle}>
                {mode === 'venue' ? 'Genres people will find you by' : 'Your genres'}
                {loading ? '' : ` (${genres.length})`}
            </Text>
            {!loading &&
                (genres.length === 0 ? (
                    <Text style={styles.muted}>Add an artist and its genres show up here.</Text>
                ) : (
                    <View style={styles.chips}>
                        {genres.map((genre: string) => (
                            <View key={genre} style={styles.genre} testID="taste-genre">
                                <Text style={styles.genreText}>{genre}</Text>
                            </View>
                        ))}
                    </View>
                ))}

            {mode === 'onboarding' && (
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.continueButton, (!complete || finishing) && styles.disabled]}
                        onPress={finish}
                        disabled={!complete || finishing}
                        testID="onboarding-continue"
                    >
                        <Text style={styles.buttonText}>Continue</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={finish} disabled={finishing} testID="onboarding-skip">
                        <Text style={styles.skip}>Skip for now</Text>
                    </TouchableOpacity>
                </View>
            )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212', padding: 16 },
    title: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', marginBottom: 6 },
    subtitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 8 },
    muted: { color: '#BBBBBB', fontSize: 14, marginBottom: 10 },
    progress: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginBottom: 10 },
    warning: { color: '#F39C12', fontSize: 13, marginTop: 6 },
    error: { color: '#FF5252', fontSize: 13, fontWeight: '600', marginTop: 6 },
    spacer: { marginVertical: 12 },
    input: {
        backgroundColor: '#FFFFFF',
        color: '#000000',
        borderRadius: 8,
        height: 48,
        paddingHorizontal: 14,
        marginTop: 6
    },
    result: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#333333'
    },
    avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
    avatarEmpty: { backgroundColor: '#5D2E0F', alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#FFFFFF' },
    resultText: { flex: 1, minWidth: 0 },
    resultName: { color: '#FFFFFF', fontWeight: '600' },
    resultGenres: { color: '#AAAAAA', fontSize: 12 },
    addButton: { backgroundColor: '#D35400', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 14 },
    buttonText: { color: '#FFFFFF', fontWeight: '600' },
    disabled: { opacity: 0.5 },
    chips: { flexDirection: 'row', flexWrap: 'wrap' },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#D35400',
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 12,
        marginRight: 8,
        marginBottom: 8
    },
    chipText: { color: '#FFFFFF' },
    genre: {
        borderWidth: 1,
        borderColor: '#666666',
        borderRadius: 999,
        paddingVertical: 4,
        paddingHorizontal: 10,
        marginRight: 8,
        marginBottom: 8
    },
    genreText: { color: '#DDDDDD', fontSize: 13 },
    actions: { flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 40 },
    continueButton: {
        flex: 1,
        backgroundColor: '#D35400',
        borderRadius: 8,
        paddingVertical: 14,
        alignItems: 'center',
        marginRight: 16
    },
    skip: { color: '#BBBBBB', textDecorationLine: 'underline' }
});

export default ArtistPickerScreen;
