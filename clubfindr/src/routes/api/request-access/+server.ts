// routes/api/request-access
//
// Sends an access request to the admin through $lib/email, like every other message
// (KNOWN_ISSUES 16). It used to build its own Gmail transport from GMAIL_USER/GMAIL_PASS, the one
// place that ignored MAIL_TRANSPORT: it sent real mail from any environment holding those keys,
// and from the e2e suite it opened a live SMTP connection to smtp.gmail.com. Now it is captured in
// tests and sent through the configured SMTP server everywhere else.

import type { RequestHandler } from '@sveltejs/kit';
import { sendEmail } from '$lib/email';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { name, email, reason } = await request.json();

		if (!name || !email || !reason) {
			return new Response('Missing required fields', { status: 400 });
		}

		await sendEmail(
			'admin@clubfindr.com',
			'New Access Request for Dev Mode Feature',
			`New Access Request:
Name: ${name}
Email: ${email}
Reason: ${reason}`
		);

		return new Response('Application submitted', { status: 200 });
	} catch (error) {
		console.error('Error sending access request:', error);
		return new Response('Error submitting application', { status: 500 });
	}
};
