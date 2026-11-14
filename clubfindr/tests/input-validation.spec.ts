import { test, expect, mobileApi } from './fixtures';

// Bad input is a 400, never a 500 (ROADMAP section 4, docs/section4-inventory.md section 4).
// The auth and account endpoints checked their input for presence at most: a number where an
// e-mail belongs threw `email.trim is not a function` or reached bcrypt and answered 500 with a
// stack in the logs, oversize strings reached the database, and a body that was not JSON threw
// in request.json(), often outside the handler's try. They now go through $lib/server/validate
// first. Each endpoint keeps the response shape its clients already read (`message` or
// `error`), so the 400 also has to come back in that shape.
//
// Only refusals are tested here; the success paths are covered by the endpoints' own specs
// (auth, promoter-auth, delete-user-data, venue-register-confirm, confirmation-attempts, …).
// Each endpoint gets a cookie-less context of its own (its own X-Forwarded-For bucket).

type Case = { label: string; body: string | Record<string, unknown> };

const NOT_JSON: Case = { label: 'a body that is not JSON', body: 'email=a@b.c' };
const JSON_ARRAY: Case = { label: 'a JSON array', body: '[]' };
const longEmail = `${'a'.repeat(250)}@clubfindr.test`;

const ENDPOINTS: { path: string; key: 'message' | 'error'; cases: Case[] }[] = [
	// Batch 1: logins, code senders and the app's code checks
	{
		path: '/login/bars',
		key: 'message',
		cases: [
			NOT_JSON,
			{ label: 'an e-mail that is a number', body: { email: 42, password: 'Secret#2026' } },
			{ label: 'a password that is an object', body: { email: 'a@b.c', password: { $ne: '' } } },
			{ label: 'an oversize e-mail', body: { email: longEmail, password: 'Secret#2026' } }
		]
	},
	{
		path: '/api/mobile/login',
		key: 'message',
		cases: [
			NOT_JSON,
			{ label: 'an e-mail that is a list', body: { email: ['a@b.c'], password: 'Secret#2026' } },
			{ label: 'a password that is a number', body: { email: 'a@b.c', password: 12345678 } }
		]
	},
	{
		path: '/api/mobile/bars/login',
		key: 'message',
		cases: [
			NOT_JSON,
			JSON_ARRAY,
			{ label: 'a password that is a number', body: { email: 'a@b.c', password: 12345678 } },
			{
				label: 'an oversize platform',
				body: { email: 'a@b.c', password: 'Secret#2026', platform: 'x'.repeat(500) }
			}
		]
	},
	{
		path: '/api/request-password-reset',
		key: 'message',
		cases: [
			NOT_JSON,
			{ label: 'no e-mail', body: {} },
			{ label: 'an e-mail that is a number', body: { email: 42 } }
		]
	},
	{
		path: '/api/send-verification-code',
		key: 'message',
		cases: [
			NOT_JSON,
			{ label: 'an e-mail that is a number', body: { email: 42 } },
			{ label: 'an unknown purpose', body: { email: 'a@b.c', purpose: 'anything' } }
		]
	},
	{
		path: '/api/resend-verification-code',
		key: 'message',
		cases: [NOT_JSON, { label: 'an e-mail that is a list', body: { email: ['a@b.c'] } }]
	},
	{
		path: '/api/verify-confirmation',
		key: 'message',
		cases: [
			NOT_JSON,
			{ label: 'a code that is a number', body: { email: 'a@b.c', confirmationCode: 123456 } },
			{ label: 'a code of the wrong length', body: { email: 'a@b.c', confirmationCode: '1234' } }
		]
	},
	{
		path: '/api/verify-email-code',
		key: 'message',
		cases: [
			NOT_JSON,
			{ label: 'an oversize e-mail', body: { email: longEmail, confirmationCode: '123456' } },
			{ label: 'a code with a symbol', body: { email: 'a@b.c', confirmationCode: '12345!' } }
		]
	}
];

for (const { path, key, cases } of ENDPOINTS) {
	test(`${path} answers bad input with a 400 in its own shape`, async ({ playwright, baseURL }) => {
		const api = await mobileApi(playwright, baseURL);
		try {
			for (const { label, body } of cases) {
				const response = await api.post(path, {
					headers: { 'Content-Type': 'application/json' },
					// A string as `data` is JSON-encoded by Playwright when the content type is JSON, so a
					// raw body goes as bytes; an object is serialised once, as a client would
					data: typeof body === 'string' ? Buffer.from(body) : body
				});
				expect.soft(response.status(), `${path}, ${label}`).toBe(400);
				const payload = await response.json().catch(() => null);
				expect.soft(typeof payload?.[key], `${path}, ${label}: a "${key}" field`).toBe('string');
			}
		} finally {
			await api.dispose();
		}
	});
}
