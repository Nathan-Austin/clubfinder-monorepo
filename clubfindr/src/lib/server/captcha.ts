// Server-side reCAPTCHA verification (KNOWN_ISSUES 28).
//
// The registration pages collect a reCAPTCHA v2 token and post it to /api/verify-captcha,
// which checks it against Google's siteverify. Tokens are single-use and expire within
// minutes, while the visitor goes on to fill in a long form — so passing the check marks the
// visitor with a short-lived encrypted cookie instead, and POST /register and
// POST /register/promoter require that cookie. It is cleared after a successful registration:
// one solved captcha admits one registration.
//
// RECAPTCHA_VERIFY_BASE overrides where the token is checked, so the e2e suite can point it
// at tests/mock-recaptcha.ts instead of Google (unset in production).

import type { Cookies } from '@sveltejs/kit';
import { RECAPTCHA_SECRET_KEY } from '$env/static/private';
import { env } from '$env/dynamic/private';
import { cookieManager } from '$lib/cookieManager';

const CAPTCHA_COOKIE = 'captcha-verified';
// Long enough to fill in the registration form after solving the captcha at page-open
const CAPTCHA_COOKIE_MAX_AGE = 30 * 60;

/** Asks Google (or the mock) whether this reCAPTCHA token is good. */
export async function verifyCaptchaToken(token: unknown): Promise<boolean> {
	if (typeof token !== 'string' || token === '') return false;
	const base = env.RECAPTCHA_VERIFY_BASE || 'https://www.google.com';
	try {
		const response = await fetch(`${base}/recaptcha/api/siteverify`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ secret: RECAPTCHA_SECRET_KEY, response: token })
		});
		if (!response.ok) return false;
		const data = await response.json();
		return data.success === true;
	} catch (error) {
		// An unreachable verifier refuses rather than waves through
		console.error('reCAPTCHA verification failed:', error);
		return false;
	}
}

/** Marks this visitor as having passed the captcha; encrypted, so it cannot be forged. */
export function markCaptchaVerified(cookies: Cookies) {
	cookieManager.set(cookies, CAPTCHA_COOKIE, String(Date.now()), {
		path: '/',
		maxAge: CAPTCHA_COOKIE_MAX_AGE
	});
}

/** Whether this visitor passed the captcha recently. */
export function hasVerifiedCaptcha(cookies: Cookies): boolean {
	return cookieManager.get(cookies, CAPTCHA_COOKIE) !== null;
}

/** Spends the visitor's captcha pass, after a successful registration. */
export function clearCaptchaVerified(cookies: Cookies) {
	cookieManager.delete(cookies, CAPTCHA_COOKIE, { path: '/' });
}
