import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../api/axiosClient', () => ({ __esModule: true, default: { put: jest.fn() } }));

import axiosClient from '../../api/axiosClient';
import {
  CITY_BEFORE_LOGIN,
  cityForQueries,
  dismissProposal,
  getUserCity,
  saveUserCity,
  wasProposalDismissed
} from '../cityService';

const put = axiosClient.put as jest.Mock;
const httpError = (status: number) => Object.assign(new Error(`HTTP error ${status}`), { response: { status } });

beforeEach(async () => {
  put.mockReset();
  await AsyncStorage.clear();
});

describe('getUserCity / cityForQueries', () => {
  it('reads the city the login stored', async () => {
    await AsyncStorage.setItem('userCity', 'london');
    expect(await getUserCity()).toBe('london');
    expect(await cityForQueries()).toBe('london');
  });

  it("falls back to the stored user's city, then to the pre-login default", async () => {
    await AsyncStorage.setItem('user', JSON.stringify({ id: 'u1', city: 'paris' }));
    expect(await getUserCity()).toBe('paris');
    await AsyncStorage.clear();
    expect(await getUserCity()).toBeNull();
    expect(await cityForQueries()).toBe(CITY_BEFORE_LOGIN);
  });
});

describe('saveUserCity', () => {
  it('saves to the account, then to the phone', async () => {
    await AsyncStorage.setItem('user', JSON.stringify({ id: 'u1', city: 'london' }));
    put.mockResolvedValue({ data: { success: true, city: 'paris' } });

    expect(await saveUserCity('Paris')).toMatchObject({ ok: true, synced: true, city: { slug: 'paris' } });
    expect(put).toHaveBeenCalledWith('/api/account/city', { city: 'paris' });
    expect(await AsyncStorage.getItem('userCity')).toBe('paris');
    expect(JSON.parse((await AsyncStorage.getItem('user'))!).city).toBe('paris');
  });

  it('keeps the choice on the phone against a server without the endpoint', async () => {
    put.mockRejectedValue(httpError(404));
    expect(await saveUserCity('stockholm')).toMatchObject({ ok: true, synced: false });
    expect(await AsyncStorage.getItem('userCity')).toBe('stockholm');
  });

  it('changes nothing when the server refuses or cannot be reached', async () => {
    await AsyncStorage.setItem('userCity', 'london');
    put.mockRejectedValueOnce(httpError(401));
    expect(await saveUserCity('paris')).toEqual({ ok: false, message: expect.stringMatching(/log in/) });
    put.mockRejectedValueOnce(new Error('Network request failed'));
    expect(await saveUserCity('paris')).toMatchObject({ ok: false });
    expect(await AsyncStorage.getItem('userCity')).toBe('london');
  });

  it('refuses a city that is not covered without asking the server', async () => {
    expect(await saveUserCity('rome')).toMatchObject({ ok: false });
    expect(put).not.toHaveBeenCalled();
  });
});

describe('city proposal', () => {
  it('remembers a dismissed proposal per city', async () => {
    expect(await wasProposalDismissed('paris')).toBe(false);
    await dismissProposal('paris');
    expect(await wasProposalDismissed('paris')).toBe(true);
    expect(await wasProposalDismissed('london')).toBe(false);
  });
});
