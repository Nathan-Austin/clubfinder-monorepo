/**
 * Server-side switches the app needs before anyone logs in (GET /api/mobile/config).
 *
 * spotifyConnectEnabled mirrors the server's SPOTIFY_CONNECT_ENABLED flag. When it is false,
 * signup and venue registration hide the music service choice and the Spotify e-mail: the
 * server ignores those fields then anyway, and never calls spotify_service.
 *
 * If the config cannot be fetched (offline, or a server from before the endpoint existed) the
 * app falls back to showing the fields. That is the safe side both ways: an older server still
 * requires the music service, and a newer one with the flag off simply ignores it.
 */

import { useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient';

export interface AppConfig {
    spotifyConnectEnabled: boolean;
}

export const FALLBACK_APP_CONFIG: AppConfig = { spotifyConnectEnabled: true };

let cached: AppConfig | null = null;
let inFlight: Promise<AppConfig> | null = null;

/** Reads the config payload defensively: anything unexpected keeps the fallback value. */
export function parseAppConfig(payload: unknown): AppConfig {
    const raw = (payload ?? {}) as { spotifyConnectEnabled?: unknown };
    return {
        spotifyConnectEnabled:
            typeof raw.spotifyConnectEnabled === 'boolean'
                ? raw.spotifyConnectEnabled
                : FALLBACK_APP_CONFIG.spotifyConnectEnabled
    };
}

/** Fetches the config once per app session; later calls reuse the answer. */
export async function fetchAppConfig(): Promise<AppConfig> {
    if (cached) return cached;
    if (!inFlight) {
        inFlight = axiosClient
            .get('/api/mobile/config')
            .then((response) => {
                cached = parseAppConfig(response.data);
                return cached;
            })
            .catch((error: unknown) => {
                console.warn('Could not load the app config; showing the music service fields', error);
                // Not cached: the next screen that asks tries again
                return FALLBACK_APP_CONFIG;
            })
            .finally(() => {
                inFlight = null;
            });
    }
    return inFlight;
}

/** The config for a screen: the fallback until the server has answered. */
export function useAppConfig(): AppConfig {
    const [config, setConfig] = useState<AppConfig>(cached ?? FALLBACK_APP_CONFIG);
    useEffect(() => {
        let active = true;
        fetchAppConfig().then((loaded) => {
            if (active) setConfig(loaded);
        });
        return () => {
            active = false;
        };
    }, []);
    return config;
}
