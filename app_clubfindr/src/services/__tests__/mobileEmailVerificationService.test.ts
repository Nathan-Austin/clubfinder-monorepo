/**
 * The sign-up code check shows the server's words, not the HTTP client's "HTTP error 400"
 * (DEVICE_CHECKLIST 2026-11-19, section 5).
 */
jest.mock('../../api/axiosClient', () => ({ __esModule: true, default: { post: jest.fn() } }));

import axiosClient from '../../api/axiosClient';
import { verifyEmailWithCode } from '../mobileEmailVerificationService';

const post = axiosClient.post as jest.Mock;
const refused = (status: number, message: string) =>
  Object.assign(new Error(`HTTP error ${status}`), { response: { status, data: { success: false, message } } });

it('passes the session on when the code is right', async () => {
  post.mockResolvedValueOnce({ data: { success: true, message: 'Email verified successfully!', token: 't', user: { id: 'u' } } });
  const result = await verifyEmailWithCode('someone@example.test', '123456');
  expect(result.success).toBe(true);
  expect((result.data as { token?: string }).token).toBe('t');
});

it("says what the server said when the code is wrong, not 'HTTP error 400'", async () => {
  post.mockRejectedValueOnce(refused(400, 'Invalid confirmation code'));
  const result = await verifyEmailWithCode('someone@example.test', '000000');
  expect(result.success).toBe(false);
  expect(result.message).toBe('Invalid confirmation code');
});

it('relays an expired code and the attempts limit the same way', async () => {
  post.mockRejectedValueOnce(refused(400, 'Confirmation code has expired'));
  expect((await verifyEmailWithCode('a@b.test', '1')).message).toBe('Confirmation code has expired');
  post.mockRejectedValueOnce(refused(429, 'Too many attempts. Request a new code.'));
  expect((await verifyEmailWithCode('a@b.test', '1')).message).toBe('Too many attempts. Request a new code.');
});

it('falls back to a plain sentence when the server sent no words', async () => {
  post.mockRejectedValueOnce(Object.assign(new Error('Network request failed'), {}));
  expect((await verifyEmailWithCode('a@b.test', '1')).message).toBe('Network request failed');
  post.mockRejectedValueOnce('odd');
  expect((await verifyEmailWithCode('a@b.test', '1')).message).toBe('Could not verify the code. Please try again.');
});
