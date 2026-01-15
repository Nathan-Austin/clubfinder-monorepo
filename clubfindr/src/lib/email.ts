import nodemailer from 'nodemailer';

// Reusable transporter configuration
const transporter = nodemailer.createTransport({
	host: 'mail.spacemail.com',
	port: 465,
	secure: true, // Use true for port 465
	auth: {
		user: process.env.SPACEMAIL_USER,
		pass: process.env.SPACEMAIL_PASSWORD
	},
	tls: {
		rejectUnauthorized: false // Only if needed for self-signed certificates
	}
});

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

		await transporter.sendMail(mailOptions);
		console.log('Email sent to:', to);
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
