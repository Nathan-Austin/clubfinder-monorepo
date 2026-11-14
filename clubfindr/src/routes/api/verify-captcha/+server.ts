// src/routes/api/verify-captcha/+server.ts
//
// The registration pages post the reCAPTCHA token here to unlock their form. Success now also
// marks the visitor with the encrypted cookie POST /register and POST /register/promoter
// require ($lib/server/captcha, KNOWN_ISSUES 28); before, the check only flipped a flag in
// the browser and the registration endpoints trusted it.
import { json } from '@sveltejs/kit';
import { markCaptchaVerified, verifyCaptchaToken } from '$lib/server/captcha';
import { readJsonObject, text } from '$lib/server/validate';

// reCAPTCHA tokens run to about 2,000 characters; anything far past that is not one
const MAX_TOKEN_LENGTH = 10_000;

export async function POST({ request, cookies }) {
	// Checked before Google is asked: a body that was not JSON threw (500) and any value was
	// forwarded (ROADMAP section 4). `message` is new; the pages read only `success`.
	const checked = text((await readJsonObject(request))?.recaptchaResponse, 'recaptchaResponse', {
		max: MAX_TOKEN_LENGTH
	});
	if (!checked.ok) return json({ success: false, message: checked.message }, { status: 400 });
	const recaptchaResponse = checked.value;

	if (await verifyCaptchaToken(recaptchaResponse)) {
		markCaptchaVerified(cookies);
		return json({ success: true });
	}
	return json({ success: false }, { status: 400 });
}
