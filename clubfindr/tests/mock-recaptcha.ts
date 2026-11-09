// A stand-in for Google's reCAPTCHA siteverify for the e2e suite, started by
// playwright.config.ts and given to the app through RECAPTCHA_VERIFY_BASE
// ($lib/server/captcha). The captcha widget itself never loads offline, so tests post a token
// to /api/verify-captcha directly; this server decides whether that token is "good".
//
//   mock-captcha-ok     accepted: { success: true }
//   anything else       refused:  { success: false, "error-codes": [...] }
//
// The response shape follows the documented API
// (https://developers.google.com/recaptcha/docs/verify); it was not captured from the live
// service (see docs/HANDOVER.md).
//
//   node tests/mock-recaptcha.ts            # listens on 127.0.0.1:4178
//   MOCK_RECAPTCHA_PORT=5003 node tests/mock-recaptcha.ts

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export const MOCK_RECAPTCHA_PORT = Number(process.env.MOCK_RECAPTCHA_PORT ?? 4178);
export const MOCK_CAPTCHA_OK = 'mock-captcha-ok';

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		let data = '';
		req.on('data', (chunk) => (data += chunk));
		req.on('end', () => resolve(data));
	});
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
	if (req.method !== 'POST' || url.pathname !== '/recaptcha/api/siteverify') {
		return sendJson(res, 404, {
			error: `mock-recaptcha: no route for ${req.method} ${url.pathname}`
		});
	}
	// The app sends a form body; Google also accepts query parameters
	const form = new URLSearchParams(await readBody(req));
	const token = form.get('response') ?? url.searchParams.get('response');
	if (!form.get('secret') && !url.searchParams.get('secret')) {
		return sendJson(res, 200, { success: false, 'error-codes': ['missing-input-secret'] });
	}
	if (token === MOCK_CAPTCHA_OK) {
		return sendJson(res, 200, {
			success: true,
			challenge_ts: new Date().toISOString(),
			hostname: 'localhost'
		});
	}
	return sendJson(res, 200, {
		success: false,
		'error-codes': [token ? 'invalid-input-response' : 'missing-input-response']
	});
});

server.listen(MOCK_RECAPTCHA_PORT, '127.0.0.1', () => {
	console.log(`mock-recaptcha listening on http://127.0.0.1:${MOCK_RECAPTCHA_PORT}`);
});
