/**
 * The logged-in venue's id and name, for every screen on the venue side (ROADMAP, "Venue side of
 * the app", step 8).
 *
 * `AuthContext.barLogin` stores them as `barId` and `barName` in AsyncStorage and `logout` removes
 * them. Each venue screen used to read them there itself, some several times, so a name changed on
 * Edit Profile showed on the dashboard only after it remounted, which tabs (they stay mounted) no
 * longer do. The provider reads them once, before the venue screens render, and `setBarName`
 * updates storage and every screen together.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme';

export type VenueContextValue = {
    /** null only if the login stored none, which the screens report as "please log in again" */
    barId: string | null;
    barName: string;
    /** After a profile save: storage and every venue screen */
    setBarName: (name: string) => Promise<void>;
};

const VenueContext = createContext<VenueContextValue | null>(null);

export function VenueProvider({ children }: { children: React.ReactNode }) {
    const [loaded, setLoaded] = useState(false);
    const [barId, setBarId] = useState<string | null>(null);
    const [barName, setBarNameState] = useState('');

    useEffect(() => {
        let active = true;
        AsyncStorage.multiGet(['barId', 'barName'])
            .then((entries) => {
                if (!active) return;
                const stored = Object.fromEntries(entries);
                setBarId(stored.barId || null);
                setBarNameState(stored.barName ?? '');
            })
            .catch(() => undefined) // nothing stored reads as no venue; the screens say so
            .finally(() => active && setLoaded(true));
        return () => {
            active = false;
        };
    }, []);

    const setBarName = useCallback(async (name: string) => {
        setBarNameState(name);
        await AsyncStorage.setItem('barName', name);
    }, []);

    const value = useMemo(() => ({ barId, barName, setBarName }), [barId, barName, setBarName]);

    if (!loaded) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }
    return <VenueContext.Provider value={value}>{children}</VenueContext.Provider>;
}

/** The logged-in venue. Only inside `VenueProvider` (the venue side's navigator). */
export function useVenue(): VenueContextValue {
    const venue = useContext(VenueContext);
    if (!venue) throw new Error('useVenue must be used within a VenueProvider');
    return venue;
}

const styles = StyleSheet.create({
    loading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
});
