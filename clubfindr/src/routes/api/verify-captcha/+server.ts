// src/routes/api/verify-captcha/+server.ts
//
// The registration pages post the reCAPTCHA token here to unlock their form. Success now also
// marks the visitor with the encrypted cookie POST /register and POST /register/promoter
// require ($lib/server/captcha, KNOWN_ISSUES 28); before, the check only flipped a flag in
// the browser and the registration endpoints trusted it.
import { json } from '@sveltejs/kit';
import { markCaptchaVerified, verifyCaptchaToken } from '$lib/server/captcha';

export async function POST({ request, cookies }) {
	const { recaptchaResponse } = await request.json();

	if (await verifyCaptchaToken(recaptchaResponse)) {
		markCaptchaVerified(cookies);
		return json({ success: true });
	}
	return json({ success: false }, { status: 400 });
}
