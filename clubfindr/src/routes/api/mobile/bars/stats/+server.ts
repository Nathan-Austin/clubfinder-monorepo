// api/mobile/bar/stats/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { validateBarToken } from '$lib/authUtils';

export const GET: RequestHandler = async ({ request, url }) => {
	const startTime = Date.now();
	console.log('========================');
	console.log('BAR STATS REQUEST');
	console.log('========================');

	try {
		// Validate authentication token
		const authHeader = request.headers.get('Authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Missing or invalid authentication token'
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		const token = authHeader.split(' ')[1];
		const barSession = await validateBarToken(token);

		if (!barSession) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Invalid or expired token'
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Get period from query params (default to 'day')
		const period = url.searchParams.get('period') || 'day';
		if (!['day', 'week', 'month'].includes(period)) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Invalid period parameter. Must be one of: day, week, month'
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Get bar stats (mock data for now, replace with actual queries)
		const visitorsToday = await getVisitorCount(barSession.barId, 'day');
		const visitorsWeek = await getVisitorCount(barSession.barId, 'week');
		const prevWeekVisitors = await getPreviousPeriodVisitors(barSession.barId, 'week');
		const weekOverWeekChange =
			prevWeekVisitors > 0
				? Math.round(((visitorsWeek - prevWeekVisitors) / prevWeekVisitors) * 100)
				: 0;
		//const matchedUsers = await getMatchedUsersCount(barSession.barId);
		//const topGenres = await getTopGenres(barSession.barId, period, 5);

		// Prepare response
		const responseBody = {
			success: true,
			stats: {
				visitorsToday,
				visitorsWeek,
				weekOverWeekChange,
				//matchedUsers,
				//topGenres,
				period,
				lastUpdated: new Date().toISOString()
			}
		};

		console.log('Total processing time:', Date.now() - startTime, 'ms');

		// Return response
		return new Response(JSON.stringify(responseBody), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Bar stats error:', error);
		return new Response(
			JSON.stringify({
				success: false,
				message: 'Server error'
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
};

// Helper function to get visitor count
async function getVisitorCount(barId: string, period: string): Promise<number> {
	try {
		let timeConstraint = '';

		if (period === 'day') {
			timeConstraint = 'AND DATE(timestamp) = CURRENT_DATE';
		} else if (period === 'week') {
			timeConstraint = "AND timestamp >= DATE_TRUNC('week', CURRENT_DATE)";
		} else if (period === 'month') {
			timeConstraint = "AND timestamp >= DATE_TRUNC('month', CURRENT_DATE)";
		}

		const result = await query(
			`SELECT COUNT(DISTINCT user_id) as count 
             FROM clubfindr.user_checkins 
             WHERE bar_id = $1 ${timeConstraint}`,
			[barId]
		);

		return parseInt(result.rows[0]?.count || '0');
	} catch (error) {
		console.error('Error getting visitor count:', error);
		return 0;
	}
}

// Helper function to get previous period visitors
async function getPreviousPeriodVisitors(barId: string, period: string): Promise<number> {
	try {
		let timeConstraint = '';

		if (period === 'week') {
			timeConstraint =
				"AND timestamp >= DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 week') " +
				"AND timestamp < DATE_TRUNC('week', CURRENT_DATE)";
		} else if (period === 'month') {
			timeConstraint =
				"AND timestamp >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') " +
				"AND timestamp < DATE_TRUNC('month', CURRENT_DATE)";
		}

		const result = await query(
			`SELECT COUNT(DISTINCT user_id) as count 
             FROM clubfindr.user_checkins 
             WHERE bar_id = $1 ${timeConstraint}`,
			[barId]
		);

		return parseInt(result.rows[0]?.count || '0');
	} catch (error) {
		console.error('Error getting previous period visitors:', error);
		return 0;
	}
}

// Helper function to get matched users count
async function getMatchedUsersCount(barId: string): Promise<number> {
	try {
		const result = await query(
			`SELECT COUNT(DISTINCT user_id) as count 
             FROM clubfindr.genre_matches 
             WHERE bar_id = $1`,
			[barId]
		);

		return parseInt(result.rows[0]?.count || '0');
	} catch (error) {
		console.error('Error getting matched users count:', error);
		return 0;
	}
}

// Helper function to get top genres
async function getTopGenres(
	barId: string,
	period: string,
	limit: number = 5
): Promise<Array<{ genre: string; count: number }>> {
	try {
		let timeConstraint = '';

		if (period === 'day') {
			timeConstraint = 'AND played_at >= CURRENT_DATE';
		} else if (period === 'week') {
			timeConstraint = "AND played_at >= DATE_TRUNC('week', CURRENT_DATE)";
		} else if (period === 'month') {
			timeConstraint = "AND played_at >= DATE_TRUNC('month', CURRENT_DATE)";
		}

		const result = await query(
			`SELECT genre, COUNT(*) as count
             FROM clubfindr.played_tracks pt
             JOIN clubfindr.track_genres tg ON pt.track_id = tg.track_id
             WHERE pt.bar_id = $1 ${timeConstraint}
             GROUP BY genre
             ORDER BY count DESC
             LIMIT $2`,
			[barId, limit]
		);

		return result.rows.map((row) => ({
			genre: row.genre,
			count: parseInt(row.count)
		}));
	} catch (error) {
		console.error('Error getting top genres:', error);
		return [];
	}
}
