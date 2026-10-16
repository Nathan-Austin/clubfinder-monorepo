// src/routes/api/verify-captcha/+server.js
import { json } from '@sveltejs/kit';
import { RECAPTCHA_SECRET_KEY } from '$env/static/private';

export async function POST({ request }) {
	const { recaptchaResponse } = await request.json();
	const secretKey = RECAPTCHA_SECRET_KEY;

	const res = await fetch(
		`https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaResponse}`,
		{
			method: 'POST'
		}
	);

	const data = await res.json();
	if (data.success) {
		return json({ success: true });
	} else {
		return json({ success: false }, { status: 400 });
	}
}
