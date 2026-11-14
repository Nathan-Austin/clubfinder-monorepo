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

// `key` is the field the 400 names its reason in; 'text' for an endpoint that answers plain text.
// `captcha`: the endpoint sits behind the solved-captcha cookie (403 without it), so the test
// solves one first; it is spent only by a successful registration.
const ENDPOINTS: {
	path: string;
	key: 'message' | 'error' | 'text';
	captcha?: boolean;
	cases: Case[];
}[] = [
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
	},
	// Batch 2: venue and promoter registration, captcha and access requests
	{
		path: '/api/mobile/bars/confirm',
		key: 'error',
		cases: [
			NOT_JSON,
			{ label: 'a code that is a number', body: { email: 'a@b.c', confirmationCode: 123456 } },
			{ label: 'no e-mail', body: { confirmationCode: 'A1B2C3' } }
		]
	},
	{
		path: '/api/mobile/bars/resend-code',
		key: 'error',
		cases: [NOT_JSON, { label: 'an e-mail that is an object', body: { email: { a: 1 } } }]
	},
	{
		path: '/register/promoter',
		key: 'message',
		captcha: true,
		cases: [
			NOT_JSON,
			{ label: 'nothing filled in', body: {} },
			{ label: 'a phone longer than the column', body: promoter({ phone: '1'.repeat(21) }) },
			{ label: 'a business name that is a number', body: promoter({ businessName: 7 }) },
			{ label: 'an address without a domain', body: promoter({ email: 'promoter@localhost' }) },
			{ label: 'a weak password', body: promoter({ password: 'short' }) }
		]
	},
	{
		path: '/register/promoter/confirm',
		key: 'error',
		cases: [
			NOT_JSON,
			{ label: 'a code of the wrong length', body: { email: 'a@b.c', confirmationCode: 'ABC' } }
		]
	},
	{
		path: '/register/promoter/confirm/resend-code',
		key: 'error',
		cases: [NOT_JSON, { label: 'an e-mail that is a number', body: { email: 42 } }]
	},
	{
		path: '/register/confirm/resend-code',
		key: 'error',
		cases: [
			NOT_JSON,
			{ label: 'an e-mail that is a number', body: { email: 42 } },
			{ label: 'no e-mail', body: {} }
		]
	},
	{
		path: '/api/verify-captcha',
		key: 'message',
		cases: [
			NOT_JSON,
			{ label: 'no token', body: {} },
			{ label: 'an oversize token', body: { recaptchaResponse: 'x'.repeat(10_001) } }
		]
	},
	{
		path: '/api/request-access',
		key: 'text',
		cases: [
			NOT_JSON,
			{ label: 'a name that is a list', body: { name: ['x'], email: 'a@b.c', reason: 'test' } },
			{ label: 'an oversize reason', body: { name: 'x', email: 'a@b.c', reason: 'x'.repeat(2001) } }
		]
	}
];

/** A promoter registration body that passes every check, with `changes` applied. */
function promoter(changes: Record<string, unknown>) {
	return {
		businessName: 'Validation Promoter',
		contactPerson: 'Validation Test',
		email: `validation-${Date.now()}@clubfindr.test`,
		phone: '+49 30 1234567',
		address: 'Teststrasse 1',
		postcode: '10115',
		cityName: 'Berlin',
		website: '',
		password: 'Valid#Pass2026x',
		...changes
	};
}

for (const { path, key, captcha, cases } of ENDPOINTS) {
	test(`${path} answers bad input with a 400 in its own shape`, async ({ playwright, baseURL }) => {
		const api = await mobileApi(playwright, baseURL);
		try {
			if (captcha) {
				const solved = await api.post('/api/verify-captcha', {
					data: { recaptchaResponse: 'mock-captcha-ok' }
				});
				expect(solved.status()).toBe(200);
			}
			for (const { label, body } of cases) {
				const response = await api.post(path, {
					headers: { 'Content-Type': 'application/json' },
					// A string as `data` is JSON-encoded by Playwright when the content type is JSON, so a
					// raw body goes as bytes; an object is serialised once, as a client would
					data: typeof body === 'string' ? Buffer.from(body) : body
				});
				expect.soft(response.status(), `${path}, ${label}`).toBe(400);
				if (key === 'text') {
					expect
						.soft((await response.text()).length, `${path}, ${label}: a reason`)
						.toBeGreaterThan(0);
				} else {
					const payload = await response.json().catch(() => null);
					expect.soft(typeof payload?.[key], `${path}, ${label}: a "${key}" field`).toBe('string');
				}
			}
		} finally {
			await api.dispose();
		}
	});
}
