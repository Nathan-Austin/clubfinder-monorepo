import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '$env/dynamic/private';
import fs from 'node:fs';
import path from 'node:path';

// Runtime configuration (see .env.example):
//   MAIL_TRANSPORT      'smtp' (default) or 'capture'
//   SMTP_HOST, SMTP_PORT (465), SMTP_SECURE (true), SMTP_USER, SMTP_PASSWORD
//   MAIL_CAPTURE_FILE   capture only: JSON lines file that receives every message
// Read at send time so the e2e suite can switch to capture without a rebuild.

let transporter: Transporter | undefined;

function smtpTransporter(): Transporter {
	if (!env.SMTP_HOST) {
		throw new Error(
			'SMTP_HOST is not set: cannot send e-mail (set MAIL_TRANSPORT=capture to write it to a file)'
		);
	}
	transporter ??= nodemailer.createTransport({
		host: env.SMTP_HOST,
		port: Number(env.SMTP_PORT || 465),
		secure: env.SMTP_SECURE !== 'false', // true for port 465
		auth: {
			user: env.SMTP_USER,
			pass: env.SMTP_PASSWORD
		},
		tls: {
			rejectUnauthorized: false // KNOWN_ISSUES 15
		}
	});
	return transporter;
}

/** Test transport: appends one JSON line per message instead of sending it. */
function captureMail(mail: Record<string, unknown>) {
	const file = env.MAIL_CAPTURE_FILE || 'test-results/mail.jsonl';
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...mail }) + '\n');
}

interface Attachment {
	filename: string;
	content: Buffer;
}

export async function sendEmail(
	to: string,
	subject: string,
	text: string,
	from = '"ClubFindr" <admin@clubfindr.com>',
	attachments?: Attachment[]
) {
	try {
		const mailOptions = {
			from,
			to,
			subject,
			text,
			attachments
		};

		if (env.MAIL_TRANSPORT === 'capture') {
			captureMail({ ...mailOptions, attachments: attachments?.map((a) => a.filename) });
			console.log('Email captured (not sent) for:', to);
		} else {
			await smtpTransporter().sendMail(mailOptions);
			console.log('Email sent to:', to);
		}
	} catch (error) {
		console.error('Error sending email:', error);
		throw error; // Re-throw to handle it higher up if necessary
	}
}

// New function for sending verification emails
export async function sendVerificationEmail(to: string, code: string) {
	const subject = 'Verify Your Tilki Account';

	const text = `
Thank you for signing up with Tilki!

Your verification code is: ${code}

Please enter this code in the app to verify your email address.
This code will expire in 1 hour.

If you did not create an account, you can safely ignore this email.

The ClubFindr Team
    `;

	await sendEmail(to, subject, text);
}

// Function for sending account deletion confirmation codes
export async function sendDeletionConfirmationEmail(to: string, code: string) {
	const subject = 'ClubFindr/Tilki Account Deletion Request';

	const text = `
We received a request to delete your ClubFindr/Tilki account.

Your confirmation code is: ${code}

Please enter this code in the app to confirm account deletion.
This code will expire in 1 hour.

If you did not request to delete your account, please ignore this email and consider changing your password.

The ClubFindr Team
    `;

	await sendEmail(to, subject, text);
}
