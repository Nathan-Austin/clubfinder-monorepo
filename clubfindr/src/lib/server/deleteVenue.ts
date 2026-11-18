// Hard-deletes a venue account, for the app's Venue tab and the web dashboard (Google Play's
// account-deletion policy covers every account an app lets people create, venues included;
// ROADMAP "From the 2026-11-18 device run").
//
// One transaction: the bars row goes, and the ON DELETE CASCADE constraints take everything
// hanging off it — bar_events, bar_sessions (every login, web and app, so no session survives
// the venue), bar_qr_codes, bar_password_resets, bar_favourite_artists, bar_music_profiles,
// bar_genre_profiles, bar_genre_aggregates, promotion_requests and user_checkins.
//
// Two references do not cascade and are handled here first:
//   - bar_promoters join rows are deleted (legacy, nothing writes them today);
//   - scraped catalogue events (clubfindr.events.bar_id, also legacy) are detached, not
//     deleted: they are the public events listing, not the venue account's own data (its own
//     events are bar_events, which cascade).
//
// Left alone on purpose: the personal account that registered the venue (bars.user_id). It is
// an account of its own — often a customer account too — with its own deletion
// (/api/delete-user-data).

import { withTransaction } from '$lib/db';

/** Deletes the venue and everything it owns; false when no such venue exists. */
export async function deleteVenue(barId: string): Promise<boolean> {
	return withTransaction(async (client) => {
		await client.query('UPDATE clubfindr.events SET bar_id = NULL WHERE bar_id = $1', [barId]);
		await client.query('DELETE FROM clubfindr.bar_promoters WHERE bar_id = $1', [barId]);
		const result = await client.query('DELETE FROM clubfindr.bars WHERE id = $1 RETURNING id', [
			barId
		]);
		return (result.rowCount ?? 0) > 0;
	});
}
