// Who may open a venue dashboard: one lookup for the web (/login/bars) and the app
// (/api/mobile/bars/login), so both accept the same credentials (KNOWN_ISSUES 69).
//
// Two ways in, tried in this order:
//
//   personal  a `users` account whose password matches, and the venue it registered
//             (`bars.user_id`). A person who manages a venue logs in with their own account.
//   venue     the venue's own login, `bars.general_email` and `bars.password_hash`.
//
// A venue must be confirmed (`bars.confirmed`) on both paths. Until 2026-11-16 the app asked for
// that and the web did not, so an unconfirmed venue reached the web dashboard only.
//
// A venue row without a password is not a venue login, on either path: /register/promoter writes
// one under the promoter's e-mail and links it to the promoter (bars.user_id), and comparing
// against a null hash throws, which answered 500 (KNOWN_ISSUES 62 on the web; the app's venue
// login still did until this module). Opening it through the personal path would also send a
// promoter to /bars instead of /promoter-home.
//
// A promoter with no venue gets `user` back and no `venue`: the web sends them to the promoter
// dashboard, the app has nothing to show them and refuses.

import { comparePassword } from '$lib/server/passwordUtils';
import type { Queryable } from '$lib/taste/favouriteArtists';

export type VenueRow = {
	id: string;
	name: string;
	city: string;
	general_email: string;
	confirmed: boolean;
};

export type PersonalAccount = {
	id: string;
	city: string;
	is_promoter: boolean;
	role: string | null;
};

export type VenueLogin = {
	/** The personal account, when its password matched (with or without a venue) */
	user: PersonalAccount | null;
	/** The confirmed venue these credentials open, if any */
	venue: VenueRow | null;
	/** The credentials matched a venue that has not confirmed its registration yet */
	unconfirmed: boolean;
	/** Which login opened `venue` */
	via: 'personal' | 'venue' | null;
};

const VENUE_COLUMNS =
	'b.id, b.name, b.city, b.general_email, COALESCE(b.confirmed, false) AS confirmed';

/** bcrypt against a stored hash that may be missing; a missing hash never matches */
async function matches(password: string, hash: unknown): Promise<boolean> {
	return typeof hash === 'string' && hash.length > 0 && comparePassword(password, hash);
}

export async function findVenueLogin(
	db: Queryable,
	email: string,
	password: string
): Promise<VenueLogin> {
	const result: VenueLogin = { user: null, venue: null, unconfirmed: false, via: null };

	// 1. The personal account, and the venue it registered. A confirmed venue first; among
	//    several, the oldest, so the answer is stable.
	const users = await db.query(
		`SELECT id, password_hash, city, is_promoter, role
		   FROM clubfindr.users WHERE general_email = $1`,
		[email]
	);
	const person = users.rows[0] as unknown as
		(PersonalAccount & { password_hash: unknown }) | undefined;
	if (person && (await matches(password, person.password_hash))) {
		result.user = {
			id: person.id,
			city: person.city,
			is_promoter: person.is_promoter === true,
			role: person.role ?? null
		};
		const linked = await db.query(
			`SELECT ${VENUE_COLUMNS} FROM clubfindr.bars b
			  WHERE b.user_id = $1 AND b.password_hash IS NOT NULL
			  ORDER BY COALESCE(b.confirmed, false) DESC, b.created_at ASC NULLS LAST
			  LIMIT 1`,
			[person.id]
		);
		const venue = linked.rows[0] as unknown as VenueRow | undefined;
		if (venue?.confirmed) return { ...result, venue, via: 'personal' };
		if (venue) result.unconfirmed = true;
	}

	// 2. The venue's own login
	const bars = await db.query(
		`SELECT ${VENUE_COLUMNS}, b.password_hash FROM clubfindr.bars b WHERE b.general_email = $1`,
		[email]
	);
	const own = bars.rows[0] as unknown as (VenueRow & { password_hash: unknown }) | undefined;
	if (own && (await matches(password, own.password_hash))) {
		const venue: VenueRow = {
			id: own.id,
			name: own.name,
			city: own.city,
			general_email: own.general_email,
			confirmed: own.confirmed
		};
		if (venue.confirmed) return { ...result, venue, via: 'venue', unconfirmed: false };
		result.unconfirmed = true;
	}

	return result;
}
