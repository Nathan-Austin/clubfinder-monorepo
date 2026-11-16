import { Platform } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../api/axiosClient', () => ({ __esModule: true, default: { post: jest.fn() } }));

import axiosClient from '../../api/axiosClient';
import { barLogin } from '../mobileBarService';

const post = axiosClient.post as jest.Mock;

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
