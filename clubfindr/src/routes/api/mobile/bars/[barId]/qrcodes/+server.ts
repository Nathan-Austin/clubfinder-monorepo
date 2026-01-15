// routes/api/mobile/bars/[barId]/qrcodes/+server.ts (for GET and POST)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db'; // Import your database module

// Get all QR codes for a bar
export const GET: RequestHandler = async ({ params }) => {
	try {
		const barId = params.barId;

		// Check if bar exists and get bar data
		const bar = await pool.query('SELECT * FROM bars WHERE id = $1', [barId]);
		if (!bar.rows.length) {
			return json({ success: false, message: 'Bar not found' }, { status: 404 });
		}

		// Get all QR codes for this bar
		const result = await pool.query(
			'SELECT * FROM bar_qr_codes WHERE bar_id = $1 ORDER BY created_at DESC',
			[barId]
		);

		// Format QR codes with app deep link
		// Modify the qrValue generation in your server code
		const qrCodes = result.rows.map((row) => ({
			id: row.id,
			title: row.title,
			type: row.type,
			qrValue: `https://clubfindr.com/redirect?barId=${barId}&qrId=${row.id}&type=${row.type}`,
			createdAt: row.created_at
		}));

		return json({ success: true, qrCodes });
	} catch (error) {
		console.error('Error fetching QR codes:', error);
		return json({ success: false, message: 'Failed to fetch QR codes' }, { status: 500 });
	}
};

// Create a new QR code for a bar
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const barId = params.barId;
		const { title, type, barName } = await request.json();

		if (!title || !type) {
			return json({ success: false, message: 'Title and type are required' }, { status: 400 });
		}

		// Validate type
		const validTypes = ['entrance', 'table', 'event', 'promotion'];
		if (!validTypes.includes(type)) {
			return json({ success: false, message: 'Invalid QR code type' }, { status: 400 });
		}

		// Insert new QR code
		const result = await pool.query(
			'INSERT INTO bar_qr_codes (bar_id, title, type, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
			[barId, title, type]
		);

		const newQRId = result.rows[0].id;

		return json({
			success: true,
			qrCode: {
				id: newQRId,
				title,
				type,
				qrValue: `clubfindr://checkin?barId=${barId}&qrId=${newQRId}&type=${type}&barName=${encodeURIComponent(
					barName || ''
				)}`,
				createdAt: new Date().toISOString()
			}
		});
	} catch (error) {
		console.error('Error creating QR code:', error);
		return json({ success: false, message: 'Failed to create QR code' }, { status: 500 });
	}
};
