/**
 * The user's city (KNOWN_ISSUES 67): which city's venues and events the app shows.
 *
 * Every login stores the account's city (users.city) under AsyncStorage `userCity`; this module
 * is the one place that reads it, and the one place that changes it, through
 * PUT /api/account/city.
 *
 * That endpoint is new on 2026-11-16. Against a server without it (404) the choice is kept on
 * this phone only and `synced` is false, so a build installed before the web deploy still lets
 * the user pick a city; the next login after that deploy would put the account's back, which
 * is why the screen says so.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import axiosClient from '../api/axiosClient';
import { findLiveCity, type LiveCity } from '../constants/cities';

export const USER_CITY_KEY = 'userCity';

/**
 * Used only when nothing at all is stored, i.e. before a login has finished: every login stores
 * the account's city. Kept as the server's own sign-up default, rather than a guess per screen.
 */
export const CITY_BEFORE_LOGIN = 'berlin';

/** The stored city (a slug, e.g. "london"), or null before a login has stored one */
export async function getUserCity(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(USER_CITY_KEY);
  if (stored) return stored;
  try {
    const user = JSON.parse((await AsyncStorage.getItem('user')) ?? 'null');
    return typeof user?.city === 'string' && user.city ? user.city : null;
  } catch {
    return null;
  }
}

/** The city to ask the server about: the stored one, or CITY_BEFORE_LOGIN */
export async function cityForQueries(): Promise<string> {
  return (await getUserCity()) ?? CITY_BEFORE_LOGIN;
}

export type SaveCityResult =
  | { ok: true; city: LiveCity; synced: boolean }
  | { ok: false; message: string };

/** Saves the city to the account (and this phone). Accepts a name or a slug of a covered city. */
export async function saveUserCity(value: string): Promise<SaveCityResult> {
  const city = findLiveCity(value);
  if (!city) return { ok: false, message: 'Choose one of the cities we cover.' };

  let synced = true;
  try {
    const response = await axiosClient.put('/api/account/city', { city: city.slug });
    const data = response.data as { success?: boolean; message?: string };
    if (data?.success === false) return { ok: false, message: data.message || 'Could not save your city.' };
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      // A server from before 2026-11-16: keep it on this phone (see the note at the top)
      synced = false;
    } else if (status === 401 || status === 403) {
      return { ok: false, message: 'Please log in again to change your city.' };
    } else {
      return { ok: false, message: 'Could not reach the server. Please try again.' };
    }
  }

  await AsyncStorage.setItem(USER_CITY_KEY, city.slug);
  try {
    const user = JSON.parse((await AsyncStorage.getItem('user')) ?? 'null');
    if (user && typeof user === 'object') {
      await AsyncStorage.setItem('user', JSON.stringify({ ...user, city: city.slug }));
    }
  } catch {
    // an unreadable stored user is left alone; userCity above is what the screens read
  }
  return { ok: true, city, synced };
}

/** "You seem to be in X" is asked once per city, not on every visit */
const dismissedKey = (slug: string) => `cityProposalDismissed:${slug}`;

export async function wasProposalDismissed(slug: string): Promise<boolean> {
  return (await AsyncStorage.getItem(dismissedKey(slug))) === '1';
}

export async function dismissProposal(slug: string): Promise<void> {
  await AsyncStorage.setItem(dismissedKey(slug), '1');
}
