import { GENERIC_LOGIN_ERROR, loginErrorMessage } from '../loginErrors';

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
