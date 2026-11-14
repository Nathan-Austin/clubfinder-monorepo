// routes/api/request-access
//
// Sends an access request to the admin through $lib/email, like every other message
// (KNOWN_ISSUES 16). It used to build its own Gmail transport from GMAIL_USER/GMAIL_PASS, the one
// place that ignored MAIL_TRANSPORT: it sent real mail from any environment holding those keys,
// and from the e2e suite it opened a live SMTP connection to smtp.gmail.com. Now it is captured in
// tests and sent through the configured SMTP server everywhere else.

import type { RequestHandler } from '@sveltejs/kit';
import { sendEmail } from '$lib/email';
import { email as emailCheck, fields, readJsonObject, text } from '$lib/server/validate';

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Checked before anything is sent: any type and any length went into the admin's mail,
		// and a body that was not JSON answered 500 (ROADMAP section 4). Plain-text answers, as
		// before.
		const body = await readJsonObject(request);
		const input = fields({
			name: text(body?.name, 'Name', { max: 100 }),
			email: emailCheck(body?.email, 'E-mail'),
			reason: text(body?.reason, 'Reason', { max: 2000 })
		});
		if (!input.ok) return new Response(input.message, { status: 400 });
		const { name, email, reason } = input.value;

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
