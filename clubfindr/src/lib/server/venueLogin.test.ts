import bcryptjs from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import type { Queryable } from '$lib/taste/favouriteArtists';
import { findVenueLogin } from './venueLogin';

const hash = (p: string) => bcryptjs.hashSync(p, 4);
const PERSON_PW = 'Person#2026';
const VENUE_PW = 'Venue#2026';

type Row = Record<string, unknown>;
function fakeDb({ user, linked, own }: { user?: Row; linked?: Row; own?: Row }): Queryable {
	return {
		async query(text: string) {
			const pick = (row?: Row) => ({ rows: row ? [row] : [], rowCount: row ? 1 : 0 });
			if (text.includes('FROM clubfindr.users')) return pick(user);
			if (text.includes('b.user_id = $1')) {
				// a promoter's placeholder venue (no password) is never a venue login
				expect(text).toContain('b.password_hash IS NOT NULL');
				return pick(linked);
			}
			if (text.includes('b.general_email = $1')) return pick(own);
			throw new Error(`unexpected query: ${text}`);
		}
	};
}

const person = {
	id: 'u1',
	password_hash: hash(PERSON_PW),
	city: 'berlin',
	is_promoter: false,
	role: null
};
const venue = (extra: Row = {}) => ({
	id: 'b1',
	name: 'Club',
	city: 'berlin',
	general_email: 'v@x.test',
	confirmed: true,
	password_hash: hash(VENUE_PW),
	...extra
});

describe('findVenueLogin', () => {
	it('opens the venue a personal account registered', async () => {
		const r = await findVenueLogin(
			fakeDb({ user: person, linked: venue() }),
			'p@x.test',
			PERSON_PW
		);
		expect(r.via).toBe('personal');
		expect(r.venue?.id).toBe('b1');
	});

	it("falls back to the venue's own login", async () => {
		const r = await findVenueLogin(fakeDb({ own: venue() }), 'v@x.test', VENUE_PW);
		expect(r).toMatchObject({ via: 'venue', user: null, unconfirmed: false });
		expect(r.venue).not.toHaveProperty('password_hash');
	});

	it("tries the venue's own login when the personal password does not match", async () => {
		const r = await findVenueLogin(fakeDb({ user: person, own: venue() }), 'v@x.test', VENUE_PW);
		expect(r).toMatchObject({ via: 'venue', user: null });
	});

	it('refuses an unconfirmed venue on either path', async () => {
		const a = await findVenueLogin(
			fakeDb({ user: person, linked: venue({ confirmed: false }) }),
			'p@x.test',
			PERSON_PW
		);
		expect(a).toMatchObject({ venue: null, unconfirmed: true });
		const b = await findVenueLogin(
			fakeDb({ own: venue({ confirmed: false }) }),
			'v@x.test',
			VENUE_PW
		);
		expect(b).toMatchObject({ venue: null, unconfirmed: true });
	});

	it('skips a venue row without a password instead of throwing (KNOWN_ISSUES 62)', async () => {
		const r = await findVenueLogin(
			fakeDb({ own: venue({ password_hash: null }) }),
			'v@x.test',
			'x'
		);
		expect(r).toMatchObject({ venue: null, unconfirmed: false, via: null });
	});

	it('returns a promoter without a venue as a user only', async () => {
		const promoter = { ...person, is_promoter: true };
		const r = await findVenueLogin(fakeDb({ user: promoter }), 'p@x.test', PERSON_PW);
		expect(r).toMatchObject({ venue: null, unconfirmed: false });
		expect(r.user?.is_promoter).toBe(true);
	});

	it('matches nothing for a wrong password', async () => {
		const r = await findVenueLogin(fakeDb({ user: person, own: venue() }), 'v@x.test', 'wrong');
		expect(r).toEqual({ user: null, venue: null, unconfirmed: false, via: null });
	});
});
