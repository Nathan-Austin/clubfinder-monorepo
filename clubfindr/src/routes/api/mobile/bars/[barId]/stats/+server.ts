// routes/api/mobile/bars/[barId]/stats/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool as db } from '$lib/db';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const barId = params.barId;

		// Get today's date in YYYY-MM-DD format
		const today = new Date().toISOString().split('T')[0];

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
			'SELECT COUNT(DISTINCT user_id) as count FROM user_checkins WHERE bar_id = $1 AND DATE(timestamp) = $2',
			[barId, today]
		);

		// Query for this week's visitors
		const weekResult = await db.query(
			'SELECT COUNT(DISTINCT user_id) as count FROM user_checkins WHERE bar_id = $1 AND timestamp BETWEEN $2 AND $3',
			[barId, startOfWeek.toISOString(), endOfWeek.toISOString()]
		);

		// Query for previous week's visitors
		const prevWeekResult = await db.query(
			'SELECT COUNT(DISTINCT user_id) as count FROM user_checkins WHERE bar_id = $1 AND timestamp BETWEEN $2 AND $3',
			[barId, startOfPrevWeek.toISOString(), endOfPrevWeek.toISOString()]
		);

		// Query for genre matches
		const matchesResult = await db.query(
			'SELECT COUNT(DISTINCT user_id) as count FROM genre_matches WHERE bar_id = $1',
			[barId]
		);

		const visitorsToday = parseInt(todayResult.rows[0]?.count || '0');
		const visitorsWeek = parseInt(weekResult.rows[0]?.count || '0');
		const visitorsPrevWeek = parseInt(prevWeekResult.rows[0]?.count || '0');
		const matchedUsers = parseInt(matchesResult.rows[0]?.count || '0');

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
				weekOverWeekChange,
				matchedUsers
			}
		});
	} catch (error) {
		console.error('Error fetching bar stats:', error);
		return json({ success: false, message: 'Failed to fetch statistics' }, { status: 500 });
	}
};
