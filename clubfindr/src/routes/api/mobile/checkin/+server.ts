// POST /api/mobile/checkin { barId, qrId, userId? } -> { success, venueName, checkinTime }
//
// Records that the logged-in user scanned a venue's QR code. The user comes from their session
// (the app's Bearer token, or the web session cookie), never from the body: this used to insert
// whatever userId, barId and timestamp it was sent, unauthenticated, so anyone could record
// check-ins for anyone, and venue stats count them. An older app still sends its own userId; a
// different one is refused. The QR code has to belong to the venue, and the time is the
// server's. The table name is schema-qualified now: without it the insert could not resolve
// (docs/section4-inventory.md, section 2).

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { getSessionUserId } from '$lib/taste/sessionUser';
import { isUuid } from '$lib/taste/favouriteArtists';

/** QR code ids are serial integers; the app sends them as strings from the scanned URL. */
function parseQrId(value: unknown): number | null {
	const text = typeof value === 'number' ? String(value) : value;
	if (typeof text !== 'string' || !/^[1-9][0-9]{0,9}$/.test(text)) return null;
	const id = Number(text);
	return id <= 2147483647 ? id : null;
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	const userId = await getSessionUserId(cookies, pool, request);
	if (!userId) {
		return json({ success: false, message: 'Not logged in' }, { status: 401 });
	}

	let body: { userId?: unknown; barId?: unknown; qrId?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ success: false, message: 'Invalid JSON' }, { status: 400 });
	}
	if (body.userId !== undefined && body.userId !== userId) {
		return json({ success: false, message: 'userId does not match the session' }, { status: 403 });
	}
	const qrId = parseQrId(body.qrId);
	if (!isUuid(body.barId) || qrId === null) {
		return json(
			{ success: false, message: 'barId must be a uuid and qrId a positive integer' },
			{ status: 400 }
		);
	}

	try {
		const venue = await pool.query(
			`SELECT b.name
			   FROM clubfindr.bar_qr_codes q
			   JOIN clubfindr.bars b ON b.id = q.bar_id
			  WHERE q.id = $1 AND q.bar_id = $2`,
			[qrId, body.barId]
		);
		if (venue.rows.length === 0) {
			return json({ success: false, message: 'Unknown QR code for this venue' }, { status: 404 });
		}

		const inserted = await pool.query(
			`INSERT INTO clubfindr.user_checkins (user_id, bar_id, qr_code_id, "timestamp")
			 VALUES ($1, $2, $3, now())
			 RETURNING "timestamp"`,
			[userId, body.barId, qrId]
		);

		return json({
			success: true,
			message: 'Check-in recorded successfully',
			venueName: venue.rows[0].name,
			checkinTime: new Date(inserted.rows[0].timestamp).toISOString()
		});
	} catch (error) {
		console.error('Error recording check-in:', error);
		return json({ success: false, message: 'Failed to record check-in' }, { status: 500 });
	}
};
