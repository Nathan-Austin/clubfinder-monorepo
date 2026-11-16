// Writing a venue registration, for the web (/register) and the app (/api/mobile/bars/register).
//
// Until 2026-11-16 both routes, before any confirmation code was entered:
//   - set the password of an existing personal account under the address to the one typed, so
//     anyone could take over an account by "registering a venue" with its e-mail and then log
//     in at /login/users;
//   - overwrote an existing venue's details and password, keeping `confirmed`, so a confirmed
//     venue's new password worked at once: a venue taken over the same way.
// Neither needed access to the mailbox.
//
// Now:
//   - an existing personal account is linked to the venue (bars.user_id) and left as it is; its
//     password still opens the venue once the venue is confirmed ($lib/server/venueLogin), and
//     the venue's own password is the one typed here;
//   - a confirmed venue under the address is refused (`conflict`): its owner logs in or resets
//     the password, which needs the mailbox;
//   - an unconfirmed one may be registered again (a retry), with a fresh code and attempts.

import type { Queryable } from '$lib/taste/favouriteArtists';

export type VenueRegistration = {
	businessName: string;
	contactPerson: string;
	email: string;
	phone: string;
	address: string;
	postcode: string;
	website: string;
	/** Already normalised ($lib/cityName) */
	city: string;
	confirmationCode: string;
	/** ISO timestamp */
	expiresAt: string;
	hashedPassword: string;
	smokingAllowed: boolean;
	barTypes: string[];
};

export type SavedRegistration = { barId: string } | { conflict: true };

export const VENUE_ALREADY_REGISTERED =
	'A venue is already registered with this e-mail address. Log in, or reset its password from the login page.';

/** Run inside one transaction (withTransaction): the user and the venue are written together. */
export async function saveVenueRegistration(
	client: Queryable,
	r: VenueRegistration
): Promise<SavedRegistration> {
	const existingBar = await client.query(
		`SELECT id, COALESCE(confirmed, false) AS confirmed FROM clubfindr.bars
		  WHERE general_email = $1 FOR UPDATE`,
		[r.email]
	);
	if (existingBar.rows[0]?.confirmed === true) return { conflict: true };

	// The personal account under the address, made if there is none. An existing one is only
	// linked: never its password, and nothing else of it either.
	const existingUser = await client.query(
		`SELECT id FROM clubfindr.users WHERE general_email = $1`,
		[r.email]
	);
	let userId = existingUser.rows[0]?.id as string | undefined;
	if (!userId) {
		const created = await client.query(
			`INSERT INTO clubfindr.users (general_email, password_hash, city, role, created_at, updated_at)
			 VALUES ($1, $2, $3, 'manager', NOW(), NOW())
			 RETURNING id`,
			[r.email, r.hashedPassword, r.city]
		);
		userId = created.rows[0]?.id as string | undefined;
		if (!userId) throw new Error('User registration failed.');
	}

	const values = [
		userId,
		r.businessName,
		r.contactPerson,
		r.phone,
		r.address,
		r.postcode,
		r.website,
		r.city,
		r.confirmationCode,
		r.expiresAt,
		r.hashedPassword,
		r.email,
		r.smokingAllowed,
		r.barTypes
	];

	if (existingBar.rows[0]) {
		// An unconfirmed registration tried again: nobody has logged in to it, so it is replaced
		await client.query(
			`UPDATE clubfindr.bars
			    SET user_id = $1, name = $2, contact_person = $3, phone = $4, address = $5,
			        postcode = $6, website = $7, city = $8, confirmation_code = $9, expires_at = $10,
			        password_hash = $11, smoking_allowed = $13, bar_types = $14,
			        confirmation_attempts = 0, updated_at = NOW()
			  WHERE general_email = $12 AND NOT COALESCE(confirmed, false)`,
			values
		);
		return { barId: existingBar.rows[0].id as string };
	}

	const inserted = await client.query(
		`INSERT INTO clubfindr.bars (
		     user_id, name, contact_person, phone, address, postcode, website, city,
		     confirmation_code, expires_at, password_hash, general_email, smoking_allowed, bar_types
		 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		 RETURNING id`,
		values
	);
	return { barId: inserted.rows[0].id as string };
}
