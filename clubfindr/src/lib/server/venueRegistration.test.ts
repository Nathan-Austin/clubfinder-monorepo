import { describe, expect, it } from 'vitest';
import type { Queryable } from '$lib/taste/favouriteArtists';
import { saveVenueRegistration, type VenueRegistration } from './venueRegistration';

const REG: VenueRegistration = {
	businessName: 'Club',
	contactPerson: 'Owner',
	email: 'v@x.test',
	phone: '',
	address: '',
	postcode: '',
	website: '',
	city: 'berlin',
	confirmationCode: 'ABC123',
	expiresAt: new Date().toISOString(),
	hashedPassword: 'hash',
	smokingAllowed: false,
	barTypes: []
};

function fakeDb({ bar, user }: { bar?: Record<string, unknown>; user?: Record<string, unknown> }) {
	const calls: string[] = [];
	const db: Queryable = {
		async query(text: string) {
			calls.push(text);
			const one = (row?: Record<string, unknown>) => ({
				rows: row ? [row] : [],
				rowCount: row ? 1 : 0
			});
			if (/FROM clubfindr\.bars/.test(text)) return one(bar);
			if (/SELECT id FROM clubfindr\.users/.test(text)) return one(user);
			if (/INSERT INTO clubfindr\.users/.test(text)) return one({ id: 'new-user' });
			if (/INSERT INTO clubfindr\.bars/.test(text)) return one({ id: 'new-bar' });
			return one();
		}
	};
	return { db, calls };
}

describe('saveVenueRegistration', () => {
	it('never writes to an existing personal account', async () => {
		const { db, calls } = fakeDb({ user: { id: 'u1' } });
		expect(await saveVenueRegistration(db, REG)).toEqual({ barId: 'new-bar' });
		expect(
			calls.filter((q) => /UPDATE clubfindr\.users|INSERT INTO clubfindr\.users/.test(q))
		).toEqual([]);
	});

	it('refuses a confirmed venue and writes nothing', async () => {
		const { db, calls } = fakeDb({ bar: { id: 'b1', confirmed: true } });
		expect(await saveVenueRegistration(db, REG)).toEqual({ conflict: true });
		expect(calls).toHaveLength(1);
	});

	it('replaces an unconfirmed registration, only while it is unconfirmed', async () => {
		const { db, calls } = fakeDb({ bar: { id: 'b1', confirmed: false }, user: { id: 'u1' } });
		expect(await saveVenueRegistration(db, REG)).toEqual({ barId: 'b1' });
		const update = calls.find((q) => /UPDATE clubfindr\.bars/.test(q));
		expect(update).toMatch(/NOT COALESCE\(confirmed, false\)/);
		expect(update).toMatch(/confirmation_attempts = 0/);
	});

	it('creates the personal account when there is none', async () => {
		const { db, calls } = fakeDb({});
		expect(await saveVenueRegistration(db, REG)).toEqual({ barId: 'new-bar' });
		expect(calls.some((q) => /INSERT INTO clubfindr\.users/.test(q))).toBe(true);
	});
});
