import fs from 'node:fs';
import path from 'node:path';

/**
 * Outgoing e-mail during the e2e run.
 *
 * playwright.config.ts starts the app with MAIL_TRANSPORT=capture and MAIL_CAPTURE_FILE set to
 * this path, so nothing the suite triggers can reach a real mail server: the app appends one
 * JSON line per message here instead, and the tests read it back to check what would have
 * been sent. Playwright empties test-results/ at the start of every run.
 */
export const MAIL_CAPTURE_FILE = path.join(import.meta.dirname, '..', 'test-results', 'mail.jsonl');

export type CapturedMail = {
	at: string;
	from: string;
	to: string;
	subject: string;
	text: string;
};

export function capturedMail(): CapturedMail[] {
	if (!fs.existsSync(MAIL_CAPTURE_FILE)) return [];
	return fs
		.readFileSync(MAIL_CAPTURE_FILE, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as CapturedMail);
}

/** Polls the capture file for a message matching `match`; undefined if none turns up. */
export async function waitForMail(
	match: (mail: CapturedMail) => boolean,
	timeoutMs = 10_000
): Promise<CapturedMail | undefined> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = capturedMail().filter(match).at(-1);
		if (found || Date.now() > deadline) return found;
		await new Promise((r) => setTimeout(r, 200));
	}
}
