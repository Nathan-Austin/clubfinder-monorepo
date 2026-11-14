// A venue of a test's own, registered and confirmed through the app's endpoints and logged in
// to the app (KNOWN_ISSUES 59).
//
// Since 2026-11-13 an app login as a venue replaces that venue's previous app session, so tests
// that logged the one seeded venue (`bar@clubfindr.test`, …b1) into the app in parallel
// invalidated each other's tokens ("Not logged in as this venue", 1 run in 2 locally). A venue
// per test cannot collide, and needs no change to the seed, so no reseed of the shared database.
//
// Use `removeVenue` in a finally: it deletes what the venue owns that does not cascade (events,
// bar_promoters), the venue (bar_sessions, QR codes, check-ins, artists cascade), and its user.

import { expect, testPassword } from './fixtures';
import type { APIRequestContext } from '@playwright/test';
import { waitForMail } from './mail';
import { devQuery } from './db';

const PASSWORD = testPassword();

export type TestVenue = { barId: string; email: string; password: string; token: string };

export async function registerVenue(api: APIRequestContext, label = 'venue'): Promise<TestVenue> {
	const email = `test-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@clubfindr.test`;
	const startedAt = Date.now();
	const registered = await api.post('/api/mobile/bars/register', {
		data: {
			businessName: `Test ${label} ${Date.now()}`,
			contactPerson: 'Venue Test',
			email,
			phone: '+49 30 1234567',
			address: 'Teststrasse 9',
			postcode: '10115',
			cityName: 'Berlin',
			website: '',
			password: PASSWORD
		}
	});
	expect(registered.status(), await registered.text()).toBe(200);
	const { barId } = await registered.json();

	// The code e-mail goes out after the answer, so wait for it in the capture file
	const mail = await waitForMail(
		(m) => m.to === email && Date.parse(m.at) >= startedAt && /confirmation code is:/.test(m.text)
	);
	const code = mail?.text.match(/Your confirmation code is: ([0-9A-F]{6})/)?.[1];
	expect(code, `a confirmation code for ${email}`).toBeDefined();
	const confirmed = await api.post('/api/mobile/bars/confirm', {
		data: { email, confirmationCode: code }
	});
	expect(confirmed.status(), await confirmed.text()).toBe(200);

	return { barId, email, password: PASSWORD, token: await venueToken(api, email) };
}

/** A fresh app session token for the venue; replaces its previous app session. */
export async function venueToken(api: APIRequestContext, email: string): Promise<string> {
	const loggedIn = await api.post('/api/mobile/bars/login', {
		data: { email, password: PASSWORD }
	});
	expect(loggedIn.status(), await loggedIn.text()).toBe(200);
	return (await loggedIn.json()).token;
}

export async function removeVenue(venue: Pick<TestVenue, 'barId' | 'email'> | undefined) {
	if (!venue) return;
	await devQuery('DELETE FROM clubfindr.events WHERE bar_id = $1', [venue.barId]);
	await devQuery('DELETE FROM clubfindr.bar_promoters WHERE bar_id = $1', [venue.barId]);
	await devQuery('DELETE FROM clubfindr.bars WHERE id = $1', [venue.barId]);
	await devQuery('DELETE FROM clubfindr.users WHERE general_email = $1', [venue.email]);
}
