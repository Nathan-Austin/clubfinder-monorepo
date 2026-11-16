/**
 * What the login screen tells someone whose login failed, from the error the customer login
 * (`/api/mobile/login`) or the venue login (`/api/mobile/bars/login`) produced.
 *
 * The screen matched lower-case keywords against the message, case-sensitively, so the
 * server's "Invalid credentials" and the venue login's other answers all fell through to the
 * generic text. Matching is case-insensitive now, and the venue login's own explanations
 * (no venue for this account, not confirmed yet) are shown as they are.
 */
export const GENERIC_LOGIN_ERROR = 'Could not log in. Please check your credentials and try again.';

export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message) return GENERIC_LOGIN_ERROR;
  const message = error.message.toLowerCase();

  if (/network|timeout|abort/.test(message)) {
    return 'Network error. Please check your internet connection and try again.';
  }
  if (message.includes('no venue')) {
    // A personal account that has not registered a venue: the server's text says what to do
    return error.message;
  }
  if (/verif|confirm/.test(message)) {
    return 'Email not verified. Please check your email for the confirmation code.';
  }
  if (/incorrect|invalid|wrong/.test(message)) {
    return 'Email or password incorrect. Please try again.';
  }
  return GENERIC_LOGIN_ERROR;
}
