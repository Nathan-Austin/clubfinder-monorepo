import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Mail configuration contract for $lib/email (runtime env, so the test server can switch it
 * without a rebuild):
 *
 *   MAIL_TRANSPORT      'smtp' (default) or 'capture'
 *   SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASSWORD   the SMTP server
 *   MAIL_CAPTURE_FILE   capture only: JSON-lines file that receives every message instead
 *
 * nodemailer is mocked throughout: nothing here may open a connection.
 */
const mocks = vi.hoisted(() => ({
	env: {} as Record<string, string | undefined>,
	sendMail: vi.fn(),
	createTransport: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('nodemailer', () => ({
	default: { createTransport: mocks.createTransport }
}));

let captureFile: string;

async function loadEmail() {
	vi.resetModules();
	return import('./email');
}

beforeEach(() => {
	vi.clearAllMocks();
	for (const key of Object.keys(mocks.env)) delete mocks.env[key];
	mocks.sendMail.mockResolvedValue({ messageId: 'mocked' });
	mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
	captureFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clubfindr-mail-')), 'mail.jsonl');
});

afterEach(() => {
	fs.rmSync(path.dirname(captureFile), { recursive: true, force: true });
});

describe('sendEmail with MAIL_TRANSPORT=capture', () => {
	it('writes the message to the capture file and never touches SMTP', async () => {
		Object.assign(mocks.env, { MAIL_TRANSPORT: 'capture', MAIL_CAPTURE_FILE: captureFile });
		const { sendEmail } = await loadEmail();

		await sendEmail('someone@clubfindr.test', 'Hello', 'First line\nSecond line');
		await sendEmail('other@clubfindr.test', 'Again', 'Body', '"Custom" <custom@clubfindr.test>');

		expect(mocks.createTransport).not.toHaveBeenCalled();
		expect(mocks.sendMail).not.toHaveBeenCalled();

		const lines = fs
			.readFileSync(captureFile, 'utf8')
			.trim()
			.split('\n')
			.map((l) => JSON.parse(l));
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({
			to: 'someone@clubfindr.test',
			subject: 'Hello',
			text: 'First line\nSecond line',
			from: '"ClubFindr" <admin@clubfindr.com>'
		});
		expect(Date.parse(lines[0].at)).not.toBeNaN();
		expect(lines[1]).toMatchObject({
			to: 'other@clubfindr.test',
			from: '"Custom" <custom@clubfindr.test>'
		});
	});
});

describe('sendEmail with MAIL_TRANSPORT=smtp', () => {
	it('uses the configured SMTP server', async () => {
		Object.assign(mocks.env, {
			MAIL_TRANSPORT: 'smtp',
			SMTP_HOST: 'smtp.example.test',
			SMTP_PORT: '2525',
			SMTP_SECURE: 'false',
			SMTP_USER: 'mailer',
			SMTP_PASSWORD: 'secret'
		});
		const { sendEmail } = await loadEmail();
		await sendEmail('someone@clubfindr.test', 'Hello', 'Body');

		expect(mocks.createTransport).toHaveBeenCalledWith(
			expect.objectContaining({
				host: 'smtp.example.test',
				port: 2525,
				secure: false,
				auth: { user: 'mailer', pass: 'secret' }
			})
		);
		expect(mocks.sendMail).toHaveBeenCalledWith(
			expect.objectContaining({ to: 'someone@clubfindr.test', subject: 'Hello', text: 'Body' })
		);
	});

	it('is the default transport and refuses to send without an SMTP_HOST', async () => {
		Object.assign(mocks.env, { SMTP_USER: 'mailer', SMTP_PASSWORD: 'secret' });
		const { sendEmail } = await loadEmail();
		// No silent fallback to a built-in server: the error must name the missing setting
		await expect(sendEmail('someone@clubfindr.test', 'Hello', 'Body')).rejects.toThrow(/SMTP_HOST/);
		expect(mocks.sendMail).not.toHaveBeenCalled();
	});
});
