// routes/api/mobile/checkin/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool as db } from '$lib/db';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { userId, barId, qrId, timestamp } = await request.json();

		if (!userId || !barId || !qrId) {
			return json({ success: false, message: 'Missing required fields' }, { status: 400 });
		}

		// Record the check-in
		await db.query(
			'INSERT INTO user_checkins (user_id, bar_id, qr_code_id, timestamp) VALUES ($1, $2, $3, $4)',
			[userId, barId, qrId, timestamp || new Date().toISOString()]
		);

		//// Get user genre preferences and bar genres for matching
		//const userGenres = await db.query('SELECT genre FROM user_genres WHERE user_id = $1', [userId]);
		//
		//const barGenres = await db.query('SELECT genre FROM bar_genres WHERE bar_id = $1', [barId]);
		//
		//// Calculate genre matches
		//const userGenreSet = new Set(userGenres.rows.map((row) => row.genre.toLowerCase()));
		//const barGenreSet = new Set(barGenres.rows.map((row) => row.genre.toLowerCase()));
		//
		//let matchCount = 0;
		//barGenreSet.forEach((genre) => {
		//	if (userGenreSet.has(genre)) {
		//		matchCount++;
		//	}
		//});
		//
		//// Record match data if there are matches
		//if (matchCount > 0) {
		//	await db.query(
		//		'INSERT INTO genre_matches (user_id, bar_id, match_count, timestamp) VALUES ($1, $2, $3, $4)',
		//		[userId, barId, matchCount, new Date().toISOString()]
		//	);
		//}

		return json({
			success: true,
			//matchCount,
			message: 'Check-in recorded successfully'
		});
	} catch (error) {
		console.error('Error recording check-in:', error);
		return json({ success: false, message: 'Failed to record check-in' }, { status: 500 });
	}
};
