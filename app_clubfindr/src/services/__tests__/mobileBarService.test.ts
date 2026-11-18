import { Platform } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../api/axiosClient', () => ({ __esModule: true, default: { post: jest.fn(), delete: jest.fn() } }));

import axiosClient from '../../api/axiosClient';
import { barLogin, deleteBarEvent, deleteVenueAccount } from '../mobileBarService';

const post = axiosClient.post as jest.Mock;
const del = axiosClient.delete as jest.Mock;

describe('barLogin', () => {
  beforeEach(() => post.mockReset());

  // From 2026-11-14 the server refused a numeric version, and on Android Platform.Version is
  // one (the API level): every Android venue login answered 400.
  it('sends the platform version as text', async () => {
    Object.defineProperty(Platform, 'Version', { value: 34, configurable: true });
    post.mockResolvedValue({ data: { success: true, token: 't', barData: { id: 'b1', name: 'Club' } } });

    await barLogin('bar@clubfindr.test', 'pw');

    const [, body] = post.mock.calls[0];
    expect(body.version).toBe('34');
    expect(typeof body.platform).toBe('string');
  });

  it("passes the server's message on, e.g. a personal account without a venue", async () => {
    post.mockRejectedValue({
      response: { status: 403, data: { message: 'No venue is linked to this account. Register your venue first.' } }
    });
    const result = await barLogin('person@clubfindr.test', 'pw');
    expect(result).toEqual({
      success: false,
      error: 'No venue is linked to this account. Register your venue first.'
    });
  });
});

// KNOWN_ISSUES 82: the app answered every delete with "not available"
describe('deleteBarEvent', () => {
  const BAR = '3f2a9c1e-8b4d-4e6f-9a1b-2c3d4e5f6a7b';
  const EVENT = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';

  beforeEach(() => del.mockReset());

  it("calls the venue's event route and reports success", async () => {
    del.mockResolvedValue({ data: { message: 'Event deleted successfully' } });
    await expect(deleteBarEvent(BAR, EVENT)).resolves.toEqual({ success: true });
    expect(del).toHaveBeenCalledWith(`/api/mobile/bars/${BAR}/events/${EVENT}`);
  });

  it('encodes the ids into the path', async () => {
    del.mockResolvedValue({ data: {} });
    await deleteBarEvent(BAR, 'a/b?c');
    expect(del).toHaveBeenCalledWith(`/api/mobile/bars/${BAR}/events/a%2Fb%3Fc`);
  });

  it('counts an event the server no longer has as deleted', async () => {
    del.mockRejectedValue({ response: { status: 404, data: { error: 'Event not found' } } });
    await expect(deleteBarEvent(BAR, EVENT)).resolves.toEqual({ success: true });
  });

  it.each([401, 403])('says the session has ended on a %i', async (status) => {
    del.mockRejectedValue({ response: { status, data: { message: 'Not authorised' } } });
    await expect(deleteBarEvent(BAR, EVENT)).resolves.toEqual({
      success: false,
      sessionEnded: true,
      error: 'Your venue session has ended. Please log in again to delete events.'
    });
  });

  it('reports any other failure without the server internals', async () => {
    del.mockRejectedValue({ response: { status: 500, data: { error: 'Failed to delete event' } } });
    await expect(deleteBarEvent(BAR, EVENT)).resolves.toEqual({
      success: false,
      error: 'Could not delete the event. Please try again.'
    });
  });

  it('reports a network failure', async () => {
    del.mockRejectedValue(new Error('Network request failed'));
    const result = await deleteBarEvent(BAR, EVENT);
    expect(result.success).toBe(false);
  });

  it('sends nothing without both ids', async () => {
    await expect(deleteBarEvent('', EVENT)).resolves.toMatchObject({ success: false });
    await expect(deleteBarEvent(BAR, '')).resolves.toMatchObject({ success: false });
    expect(del).not.toHaveBeenCalled();
  });
});

// Venue account deletion (Google Play's account-deletion policy; ROADMAP "From the 2026-11-18
// device run"): the server removes the venue and everything it owns in one transaction.
describe('deleteVenueAccount', () => {
  const BAR = '3f2a9c1e-8b4d-4e6f-9a1b-2c3d4e5f6a7b';

  beforeEach(() => del.mockReset());

  it("calls the venue's own route and reports success", async () => {
    del.mockResolvedValue({ data: { success: true } });
    await expect(deleteVenueAccount(BAR)).resolves.toEqual({ success: true });
    expect(del).toHaveBeenCalledWith(`/api/mobile/bars/${BAR}`);
  });

  it('counts a venue the server no longer has as deleted', async () => {
    del.mockRejectedValue({ response: { status: 404, data: { message: 'Bar not found' } } });
    await expect(deleteVenueAccount(BAR)).resolves.toEqual({ success: true });
  });

  it.each([401, 403])('says the session has ended on a %i', async (status) => {
    del.mockRejectedValue({ response: { status, data: { error: 'Not logged in as this venue' } } });
    await expect(deleteVenueAccount(BAR)).resolves.toEqual({
      success: false,
      sessionEnded: true,
      error: 'Your venue session has ended. Please log in again to delete the venue.'
    });
  });

  it('reports any other failure without the server internals', async () => {
    del.mockRejectedValue({ response: { status: 500, data: { message: 'Could not delete the venue account' } } });
    await expect(deleteVenueAccount(BAR)).resolves.toEqual({
      success: false,
      error: 'Could not delete the venue account. Please try again.'
    });
  });

  it('sends nothing without a bar id', async () => {
    await expect(deleteVenueAccount('')).resolves.toMatchObject({ success: false });
    expect(del).not.toHaveBeenCalled();
  });
});
