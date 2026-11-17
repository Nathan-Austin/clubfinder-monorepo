/**
 * What the login screen tells someone whose login failed, from the error the customer login
 * (`/api/mobile/login`) or the venue login (`/api/mobile/bars/login`) produced.
 *
 * The screen matched lower-case keywords against the message, case-sensitively, so the
 * server's "Invalid credentials" and the venue login's other answers all fell through to the
 * generic text. Matching is case-insensitive now, and the venue login's own explanations
 * (no venue for this account, not confirmed yet) are shown as they are.
 *
 * KNOWN_ISSUES 81: a failed request reaches here as the HTTP client's error, whose `message` is
 * only "HTTP error 401"; the server's own words are in `response.data.message`. Only the venue
 * login (which re-throws the server's text) got the right message. Both are read now, and a 401
 * from either login means a wrong e-mail or password.
 */
import { errorMessage, errorStatus } from '../types/api';

export const GENERIC_LOGIN_ERROR = 'Could not log in. Please check your credentials and try again.';
export const INCORRECT_LOGIN_ERROR = 'Email or password incorrect. Please try again.';

export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return GENERIC_LOGIN_ERROR;

  // The server's explanation if the reply had one (errorMessage prefers it), and the error's own
  const fromServer = errorMessage(error, '');
  const texts = [fromServer, error.message].filter((text) => typeof text === 'string' && text);
  if (texts.length === 0) return GENERIC_LOGIN_ERROR;
  const message = texts.join(' ').toLowerCase();

  if (/network|timeout|abort/.test(message)) {
    return 'Network error. Please check your internet connection and try again.';
  }
  if (message.includes('no venue')) {
    // A personal account that has not registered a venue: the server's text says what to do
    return texts.find((text) => text.toLowerCase().includes('no venue')) ?? GENERIC_LOGIN_ERROR;
  }
  if (/verif|confirm/.test(message)) {
    return 'Email not verified. Please check your email for the confirmation code.';
  }
  if (errorStatus(error) === 401 || /incorrect|invalid|wrong/.test(message)) {
    return INCORRECT_LOGIN_ERROR;
  }
  return GENERIC_LOGIN_ERROR;
}
