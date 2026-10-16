//routes/api/request-access

import type { RequestHandler } from '@sveltejs/kit';
import nodemailer from 'nodemailer';
import { GMAIL_USER, GMAIL_PASS } from '$env/static/private';

export const POST: RequestHandler = async ({ request }) => {
	console.log('Request received at /api/request-access');

	try {
		const { name, email, reason } = await request.json();

		if (!name || !email || !reason) {
			console.warn('Missing required fields:', { name, email, reason });
			return new Response('Missing required fields', { status: 400 });
		}

		const emailContent = `
		New Access Request:
		Name: ${name}
		Email: ${email}
		Reason: ${reason}
		`;

		const transporter = nodemailer.createTransport({
			host: 'smtp.gmail.com',
			port: 587, // or 587 for STARTTLS
			secure: false,
			auth: {
				user: GMAIL_USER,
				pass: GMAIL_PASS
			},
			connectionTimeout: 10000,
			tls: {
				rejectUnauthorized: false // This allows for self-signed certificates or less strict verification
			}
		});

		const mailOptions = {
			from: '"ClubFindr Dev Mode" <nath.austin@gmail.com>',
			to: 'admin@clubfindr.com',
			subject: 'New Access Request for Dev Mode Feature',
			text: emailContent
		};

		await transporter.sendMail(mailOptions);

		return new Response('Application submitted', { status: 200 });
	} catch (error) {
		console.error('Error sending email:', error);
		return new Response('Error submitting application', { status: 500 });
	}
};
