import { test, expect, mobileApi, testPassword } from './fixtures';
import type { APIRequestContext } from '@playwright/test';
import { waitForMail } from './mail';
import { devQuery } from './db';

// Confirmation codes can be guessed only so many times (KNOWN_ISSUES 55, fixed 2026-11-14).
// Every confirm endpoint accepted unlimited guesses at a six-hex-digit code; the "3 attempts" on
// the registration pages were client-side. Each guess now spends one of CODE_MAX_ATTEMPTS (5) in
// the database ($lib/server/codeAttempts); once they are gone the right code is refused too
// (429) until a new code is issued, which refills the budget.
//
// Each test registers its own account and removes it afterwards. Cookie-less contexts
// (mobileApi), one per test, so nothing authorises a request but what the test sends.

const MAX_ATTEMPTS = 5;
const PASSWORD = testPassword();
const unique = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** A six-hex-digit code that is not `code`. */
const wrongCode = (code: string) => (code === '000000' ? '111111' : '000000');

async function solveCaptcha(api: APIRequestContext) {
	const verified = await api.post('/api/verify-captcha', {
		data: { recaptchaResponse: 'mock-captcha-ok' }
	});
	expect(verified.status()).toBe(200);
}

async function codeFromMail(email: string, since: number, pattern: RegExp): Promise<string> {
	const mail = await waitForMail(
		(m) => m.to === email && Date.parse(m.at) >= since && pattern.test(m.text)
	);
	const code = mail?.text.match(pattern)?.[1];
	expect(code, `a confirmation code in the mail to ${email}`).toBeDefined();
	return code!;
}

/** Spends the whole budget on wrong guesses, each refused as wrong, not as exhausted. */
async function exhaust(guess: (code: string) => Promise<number>, code: string) {
	for (let i = 0; i < MAX_ATTEMPTS; i++) {
		expect(await guess(wrongCode(code)), `wrong guess ${i + 1}`).toBe(400);
	}
}

test('web venue registration: five wrong codes, then even the right one is refused until a new code', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = `${unique('attempts-venue')}@clubfindr.test`;
	try {
		await solveCaptcha(api);
		const startedAt = Date.now();
		const registered = await api.post('/register', {
			data: {
				businessName: unique('Attempts Bar'),
				contactPerson: 'Attempts Test',
				email,
				phone: '+49 30 1234567',
				address: 'Teststrasse 5',
				postcode: '10115',
				cityName: 'Berlin',
				website: '',
				password: PASSWORD,
				smokingAllowed: false,
				barTypes: ['club']
			}
		});
		expect(registered.status(), await registered.text()).toBe(200);
		const code = await codeFromMail(email, startedAt, /Your confirmation code is ([0-9A-F]{6})/);

		const guess = async (confirmationCode: string) =>
			(await api.post('/register/confirm', { data: { email, confirmationCode } })).status();
		await exhaust(guess, code);

		const refused = await api.post('/register/confirm', {
			data: { email, confirmationCode: code }
		});
		expect(refused.status()).toBe(429);
		expect((await refused.json()).error).toContain('Too many wrong codes');
		expect(
			await devQuery<{ confirmed: boolean }>(
				'SELECT confirmed FROM clubfindr.bars WHERE general_email = $1',
				[email]
			)
		).toEqual([{ confirmed: false }]);

		// A new code refills the budget. The resend route refuses while the current code is still
		// valid (10 minutes), so the code is aged in the database rather than waited for.
		await devQuery(
			"UPDATE clubfindr.bars SET expires_at = now() - interval '1 minute' WHERE general_email = $1",
			[email]
		);
		const resentAt = Date.now();
		const resent = await api.post('/register/confirm/resend-code', { data: { email } });
		expect(resent.status(), await resent.text()).toBe(200);
		const newCode = await codeFromMail(
			email,
			resentAt,
			/Your new confirmation code is ([0-9A-F]{6})/
		);
		expect(await guess(newCode)).toBe(200);
		expect(
			await devQuery<{ confirmed: boolean; confirmation_attempts: number }>(
				'SELECT confirmed, confirmation_attempts FROM clubfindr.bars WHERE general_email = $1',
				[email]
			)
		).toEqual([{ confirmed: true, confirmation_attempts: 0 }]);
	} finally {
		await devQuery('DELETE FROM clubfindr.bars WHERE general_email = $1', [email]);
		await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [email]);
		await api.dispose();
	}
});

test('promoter registration: the budget applies to /register/promoter/confirm', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = `${unique('attempts-promoter')}@clubfindr.test`;
	try {
		await solveCaptcha(api);
		const startedAt = Date.now();
		const registered = await api.post('/register/promoter', {
			data: {
				businessName: unique('Attempts Promoter'),
				contactPerson: 'Attempts Promoter',
				email,
				phone: '+49 30 1234567',
				address: 'Teststrasse 3',
				postcode: '10115',
				cityName: 'Berlin',
				website: '',
				password: PASSWORD
			}
		});
		expect(registered.status(), await registered.text()).toBe(200);
		const code = await codeFromMail(email, startedAt, /Confirmation Code: ([0-9A-F]{6})/);

		const guess = async (confirmationCode: string) =>
			(
				await api.post('/register/promoter/confirm', { data: { email, confirmationCode } })
			).status();
		await exhaust(guess, code);
		expect(await guess(code)).toBe(429);
	} finally {
		await devQuery('DELETE FROM clubfindr.bars WHERE general_email = $1', [email]);
		await devQuery(
			'DELETE FROM clubfindr.promoters WHERE id IN (SELECT id FROM clubfindr.users WHERE general_email = $1)',
			[email]
		);
		await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [email]);
		await api.dispose();
	}
});

test('mobile venue registration: the budget applies to /api/mobile/bars/confirm', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = `${unique('attempts-mobile')}@clubfindr.test`;
	try {
		const startedAt = Date.now();
		const registered = await api.post('/api/mobile/bars/register', {
			data: {
				businessName: unique('Attempts Mobile Bar'),
				contactPerson: 'Attempts Mobile',
				email,
				phone: '+49 30 1234567',
				address: 'Teststrasse 7',
				postcode: '10115',
				cityName: 'Berlin',
				website: '',
				password: PASSWORD
			}
		});
		expect(registered.status(), await registered.text()).toBe(200);
		expect(await registered.json()).toMatchObject({ success: true });
		const code = await codeFromMail(email, startedAt, /Your confirmation code is: ([0-9A-F]{6})/);

		const guess = async (confirmationCode: string) =>
			(await api.post('/api/mobile/bars/confirm', { data: { email, confirmationCode } })).status();
		await exhaust(guess, code);
		expect(await guess(code)).toBe(429);
	} finally {
		await devQuery('DELETE FROM clubfindr.bars WHERE general_email = $1', [email]);
		await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [email]);
		await api.dispose();
	}
});

test('data deletion: five wrong codes leave the account intact, and a new code works again', async ({
	playwright,
	baseURL
}) => {
	const api = await mobileApi(playwright, baseURL);
	const email = `${unique('attempts-delete')}@clubfindr.test`;
	try {
		const signup = await api.post('/login/users', {
			data: { provider: 'local', isNewUser: true, email, password: PASSWORD, fullName: 'Attempts' }
		});
		expect(signup.status(), await signup.text()).toBe(200);

		const requestCode = async () => {
			const since = Date.now();
			const sent = await api.post('/api/send-delete-confirmation-code', { data: { email } });
			expect(sent.status(), await sent.text()).toBe(200);
			return codeFromMail(email, since, /Your confirmation code is ([0-9A-F]{6})/);
		};
		const guess = async (confirmationCode: string) =>
			(await api.post('/api/delete-user-data', { data: { email, confirmationCode } })).status();

		const code = await requestCode();
		await exhaust(guess, code);
		expect(await guess(code)).toBe(429);
		expect(
			await devQuery<{ n: string }>(
				'SELECT count(*) AS n FROM clubfindr.users WHERE general_email = $1',
				[email]
			)
		).toEqual([{ n: '1' }]);

		// Requesting a new code refills the budget, and that code deletes the account
		const newCode = await requestCode();
		expect(await guess(newCode)).toBe(200);
		expect(
			await devQuery<{ n: string }>(
				'SELECT count(*) AS n FROM clubfindr.users WHERE general_email = $1',
				[email]
			)
		).toEqual([{ n: '0' }]);
	} finally {
		await devQuery(
			'DELETE FROM clubfindr.user_sessions WHERE user_id IN (SELECT id FROM clubfindr.users WHERE general_email = $1)',
			[email]
		);
		await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [email]);
		await api.dispose();
	}
});
