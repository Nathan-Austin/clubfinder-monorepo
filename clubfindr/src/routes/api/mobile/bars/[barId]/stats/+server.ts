// routes/api/mobile/bars/[barId]/stats/+server.ts
//
// A venue's own visitor counts. Unlike the reads customers use for discovery these are the
// venue's business figures, so only that venue may fetch them (KNOWN_ISSUES 26): it used to
// answer anyone who knew the bar id. The app reads /api/mobile/bars/stats instead, which
// takes the venue from the Bearer token and never trusted the id in the path.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool as db } from '$lib/db';
import { toLocalIsoDate } from '$lib/localDate';
import { denyUnlessBarManager } from '$lib/server/barAuth';

export const GET: RequestHandler = async ({ params, url, cookies, request }) => {
	const denied = await denyUnlessBarManager({ params, cookies, request });
	if (denied) return denied;

	try {
		const barId = params.barId;

		// The venue's own calendar date if the caller sends one (?date=YYYY-MM-DD), else the
		// server's local day. The UTC day used to be counted as "today", so after 22:00/23:00
		// local the counter jumped to tomorrow and showed no visitors (KNOWN_ISSUES 17).
		const requestedDate = url.searchParams.get('date');
		const today = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate ?? '')
			? (requestedDate as string)
			: toLocalIsoDate();

		// Get start and end of current week
		const now = new Date();
		const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
		const startOfWeek = new Date(now);
		startOfWeek.setDate(now.getDate() - dayOfWeek);
		startOfWeek.setHours(0, 0, 0, 0);

		const endOfWeek = new Date(startOfWeek);
		endOfWeek.setDate(startOfWeek.getDate() + 6);
		endOfWeek.setHours(23, 59, 59, 999);

		// Get start and end of previous week
		const startOfPrevWeek = new Date(startOfWeek);
		startOfPrevWeek.setDate(startOfPrevWeek.getDate() - 7);

		const endOfPrevWeek = new Date(endOfWeek);
		endOfPrevWeek.setDate(endOfPrevWeek.getDate() - 7);

		// Query for today's visitors
		const todayResult = await db.query(
			'SELECT COUNT(DISTINCT user_id) as count FROM clubfindr.user_checkins WHERE bar_id = $1 AND DATE(timestamp) = $2',
			[barId, today]
		);

		// Query for this week's visitors
		const weekResult = await db.query(
			'SELECT COUNT(DISTINCT user_id) as count FROM clubfindr.user_checkins WHERE bar_id = $1 AND timestamp BETWEEN $2 AND $3',
			[barId, startOfWeek.toISOString(), endOfWeek.toISOString()]
		);

		// Query for previous week's visitors
		const prevWeekResult = await db.query(
			'SELECT COUNT(DISTINCT user_id) as count FROM clubfindr.user_checkins WHERE bar_id = $1 AND timestamp BETWEEN $2 AND $3',
			[barId, startOfPrevWeek.toISOString(), endOfPrevWeek.toISOString()]
		);

		// No genre matches here: there is no `genre_matches` table (the same count is commented
		// out in /api/mobile/bars/stats for that reason), so this used to throw every time.

		const visitorsToday = parseInt(todayResult.rows[0]?.count || '0');
		const visitorsWeek = parseInt(weekResult.rows[0]?.count || '0');
		const visitorsPrevWeek = parseInt(prevWeekResult.rows[0]?.count || '0');

		// Calculate week-over-week change as a percentage
		let weekOverWeekChange = 0;
		if (visitorsPrevWeek > 0) {
			weekOverWeekChange = Math.round(((visitorsWeek - visitorsPrevWeek) / visitorsPrevWeek) * 100);
		} else if (visitorsWeek > 0) {
			weekOverWeekChange = 100; // 100% increase from 0
		}

		return json({
			success: true,
			stats: {
				visitorsToday,
				visitorsWeek,
				visitorsPrevWeek,
				weekOverWeekChange
			}
		});
	} catch (error) {
		console.error('Error fetching bar stats:', error);
		return json({ success: false, message: 'Failed to fetch statistics' }, { status: 500 });
	}
};
