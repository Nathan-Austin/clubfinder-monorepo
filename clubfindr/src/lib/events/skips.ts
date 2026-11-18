// The dates a venue has cancelled out of a recurring event (KNOWN_ISSUES 89).
//
// A recurring event is one row expanded into dates ($lib/events/recurrence), so cancelling one
// night used to mean deleting the series and losing every other date. A cancelled date is a row
// in clubfindr.bar_event_skips; attaching them to the rows before they are expanded is all the
// occurrence function needs, so the night disappears from the venue's list, from both matchers
// and from /barfindr, and the series goes on.

import type { Queryable } from '$lib/taste/favouriteArtists';
import { toIsoDate } from './recurrence';

/** The cancelled dates of each event, as `event id -> ['YYYY-MM-DD', …]`. */
export async function listEventSkips(
	db: Queryable,
	eventIds: readonly string[]
): Promise<Map<string, string[]>> {
	const skips = new Map<string, string[]>();
	if (eventIds.length === 0) return skips;

	const result = await db.query(
		'SELECT event_id, skip_date FROM clubfindr.bar_event_skips WHERE event_id = ANY($1)',
		[eventIds]
	);
	for (const row of result.rows) {
		const date = toIsoDate(row.skip_date as string | Date);
		if (!date) continue;
		const eventId = String(row.event_id);
		skips.set(eventId, [...(skips.get(eventId) ?? []), date]);
	}
	return skips;
}

/** The same rows with their cancelled dates attached, ready for the occurrence function. */
export async function withEventSkips<T extends { id?: unknown }>(
	db: Queryable,
	rows: readonly T[]
): Promise<(T & { skip_dates: string[] })[]> {
	const ids = rows.map((row) => String(row.id ?? '')).filter(Boolean);
	const skips = await listEventSkips(db, [...new Set(ids)]);
	return rows.map((row) => ({ ...row, skip_dates: skips.get(String(row.id ?? '')) ?? [] }));
}
