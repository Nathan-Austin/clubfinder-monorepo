jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../utils/NetworkCache', () => ({ __esModule: true, default: { resolveDNS: jest.fn() } }));

import { readFileSync } from 'fs';
import path from 'path';
import axiosClient from '../../api/axiosClient';
import { httpError } from '../../types/api';
import { GENERIC_LOGIN_ERROR, INCORRECT_LOGIN_ERROR, loginErrorMessage } from '../loginErrors';

describe('loginErrorMessage', () => {
  it("reads the server's 'Invalid credentials' as a wrong e-mail or password", () => {
    expect(loginErrorMessage(new Error('Invalid credentials'))).toMatch(/password incorrect/);
  });

  it('shows the venue login\'s "no venue" answer as it is', () => {
    const text = 'No venue is linked to this account. Register your venue first.';
    expect(loginErrorMessage(new Error(text))).toBe(text);
  });

  it('explains an unconfirmed account or venue', () => {
    expect(
      loginErrorMessage(
        new Error('Email not verified. Please check your email for verification instructions.')
      )
    ).toMatch(/not verified/);
  });

  it('recognises network failures', () => {
    expect(loginErrorMessage(new Error('Network request failed'))).toMatch(/Network error/);
  });

  it('falls back to the generic text', () => {
    expect(loginErrorMessage(new Error('Server error'))).toBe(GENERIC_LOGIN_ERROR);
    expect(loginErrorMessage('not an error')).toBe(GENERIC_LOGIN_ERROR);
  });
});

// KNOWN_ISSUES 81: the tests above hand loginErrorMessage an Error carrying the server's words,
// which the real HTTP client never produces. Its error says "HTTP error 401" and keeps the
// server's message in response.data, so the phone showed the generic text.
describe('loginErrorMessage with the errors the HTTP client throws', () => {
  function serverAnswers(status: number, body: unknown) {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    ) as jest.Mock;
  }

  async function customerLoginError(): Promise<unknown> {
    try {
      await axiosClient.post('/api/mobile/login', { email: 'a@b.test', password: 'x', isMobileApp: true });
    } catch (error) {
      return error;
    }
    throw new Error('the login did not fail');
  }

  it("a wrong password's 401 reaches the screen as 'Email or password incorrect'", async () => {
    serverAnswers(401, { success: false, message: 'Invalid credentials' });
    const error = await customerLoginError();
    expect(error).toMatchObject({ response: { status: 401 } });
    expect(loginErrorMessage(error)).toBe(INCORRECT_LOGIN_ERROR);
  });

  it('a 401 without a body still means the e-mail or password', () => {
    const error = httpError('HTTP error 401', { status: 401, data: {} });
    expect(loginErrorMessage(error)).toBe(INCORRECT_LOGIN_ERROR);
  });

  it("reads the venue login's 'no venue' answer from the body", () => {
    const text = 'No venue is linked to this account. Register your venue first.';
    const error = httpError('HTTP error 403', { status: 403, data: { message: text } });
    expect(loginErrorMessage(error)).toBe(text);
  });

  it('keeps a server error generic', async () => {
    serverAnswers(500, { success: false, message: 'Server error' });
    expect(loginErrorMessage(await customerLoginError())).toBe(GENERIC_LOGIN_ERROR);
  });

  it('recognises a failed connection through the client', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as jest.Mock;
    expect(loginErrorMessage(await customerLoginError())).toMatch(/Network error/);
  });
});

describe('the customer login posts the password once', () => {
  // Both used to retry every failure, a wrong password included, against the web's /login/users,
  // which also replaced the 401 the screen needed to see
  it.each([
    ['screens/LoginScreen.tsx'],
    ['services/authService.ts'],
  ])('%s has no fallback to /login/users', (file) => {
    const source = readFileSync(path.resolve('src', file), 'utf8');
    expect(source).not.toMatch(/post\(\s*['"`]\/login\/users/);
  });
});
