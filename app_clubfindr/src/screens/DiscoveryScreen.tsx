/**
 * Discover ("Find Your Vibe"): bars and clubs for the user's taste profile.
 *
 * This tab used to read the user's own Spotify library (top artists, recently played,
 * playlists). Per-account Spotify connect is retired, so it now works from the taste profile,
 * the artists the user picked here or on the web (or imported from Last.fm), and their genres.
 * Searching stores those genres as `selected-genres` and opens Tilki, which fetches the matches
 * for the chosen day the same way it does for the genre picker on the Search tab.
 */
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { MainTabParamList, RootStackParamList } from '../navigation';
import { errorMessage, tasteApi, USER_TASTE_BASE } from '../services/tasteService';
import { discoverState } from '../utils/tasteSelection';

type DiscoveryScreenNavigationProp = StackNavigationProp<
    MainTabParamList & RootStackParamList,
    'Discover'
>;

type State =
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | ReturnType<typeof discoverState>;

const DiscoveryScreen = () => {
    const navigation = useNavigation<DiscoveryScreenNavigationProp>();
    const [state, setState] = useState<State>({ kind: 'loading' });

    const load = useCallback(async () => {
        setState({ kind: 'loading' });
        try {
            const profile = await tasteApi(USER_TASTE_BASE).list();
            setState(discoverState(profile));
        } catch (error) {
            setState({ kind: 'error', message: errorMessage(error, 'Could not load your taste profile.') });
        }
    }, []);

    // Reload whenever the tab comes back into view: the artists may have changed in the picker
    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const search = async (venueType: 'bar' | 'club') => {
        if (state.kind !== 'ready') return;
        await AsyncStorage.setItem('selected-genres', state.genres.join(','));
        navigation.navigate('Tilki', { venueType, refreshKey: Date.now() });
    };

    const editArtists = () => navigation.navigate('ArtistPicker', { mode: 'profile' });

    if (state.kind === 'loading') {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#D35400" />
            </View>
        );
    }

    if (state.kind === 'error') {
        return (
            <View style={styles.centered}>
                <Text style={styles.message}>{state.message}</Text>
                <TouchableOpacity style={styles.secondaryButton} onPress={load}>
                    <Text style={styles.secondaryButtonText}>Try again</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (state.kind !== 'ready') {
        return (
            <View style={styles.centered} testID="discover-empty">
                <Ionicons name="musical-notes-outline" size={48} color="#D35400" />
                <Text style={styles.title}>Find your vibe</Text>
                <Text style={styles.message}>
                    {state.kind === 'empty'
                        ? 'Pick a few artists you love and we will find bars and clubs that play their kind of music.'
                        : 'We do not know the genres of your artists yet. Add one or two more to get matches.'}
                </Text>
                <TouchableOpacity style={styles.primaryButton} onPress={editArtists}>
                    <Text style={styles.primaryButtonText}>Pick artists</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="discover-ready">
            <Text style={styles.title}>Your sound</Text>
            <Text style={styles.subtitle}>From the artists in your taste profile</Text>
            <View style={styles.genres}>
                {state.genres.map((genre) => (
                    <View key={genre} style={styles.genreBadge}>
                        <Text style={styles.genreText}>{genre}</Text>
                    </View>
                ))}
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={() => search('bar')}>
                <Ionicons name="wine-outline" size={20} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Find bars</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={() => search('club')}>
                <Ionicons name="musical-note-outline" size={20} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Find clubs</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={editArtists}>
                <Text style={styles.secondaryButtonText}>Edit my artists</Text>
            </TouchableOpacity>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212'
    },
    content: {
        padding: 20
    },
    centered: {
        flex: 1,
        backgroundColor: '#121212',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
    },
    title: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: 'bold',
        marginTop: 12,
        marginBottom: 6
    },
    subtitle: {
        color: '#AAAAAA',
        fontSize: 14,
        marginBottom: 16
    },
    message: {
        color: '#CCCCCC',
        fontSize: 15,
        textAlign: 'center',
        marginVertical: 12
    },
    genres: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 20
    },
    genreBadge: {
        backgroundColor: '#2A2A2A',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginRight: 8,
        marginBottom: 8
    },
    genreText: {
        color: '#FFFFFF',
        fontSize: 13
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#D35400',
        borderRadius: 8,
        paddingVertical: 14,
        paddingHorizontal: 20,
        marginTop: 12,
        alignSelf: 'stretch'
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8
    },
    secondaryButton: {
        alignItems: 'center',
        paddingVertical: 14,
        marginTop: 8,
        alignSelf: 'stretch'
    },
    secondaryButtonText: {
        color: '#D35400',
        fontSize: 15
    }
});

export default DiscoveryScreen;
