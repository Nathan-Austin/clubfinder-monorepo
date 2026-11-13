// Guard for endpoints that change a venue: only that venue may call them, by its web dashboard
// session cookie or the Bearer token from /api/mobile/bars/login ($lib/taste/barSession).
//
//   const denied = await denyUnlessBarManager({ params, cookies, request });
//   if (denied) return denied;
//
// Answers 400 for a malformed barId and 403 otherwise, in the { error } shape the mobile bar
// endpoints already use. Read-only endpoints that customers use for discovery (GET events,
// GET the bar) stay public and do not call this.

import { json, type Cookies } from '@sveltejs/kit';
import { pool } from '$lib/db';
import { canManageBar } from '$lib/taste/barSession';
import { isUuid } from '$lib/taste/favouriteArtists';

export async function denyUnlessBarManager({
	params,
	cookies,
	request
}: {
	params: { barId?: string };
	cookies: Cookies;
	request: Request;
}): Promise<Response | null> {
	const barId = params.barId ?? '';
	if (!isUuid(barId)) return json({ error: 'barId must be a uuid' }, { status: 400 });
	if (!(await canManageBar(pool, barId, { cookies, request }))) {
		return json({ error: 'Not logged in as this venue' }, { status: 403 });
	}
	return null;
}
