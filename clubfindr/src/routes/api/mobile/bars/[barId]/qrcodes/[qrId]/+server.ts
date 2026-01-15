// routes/api/mobile/bars/[barId]/qrcodes/[qrId]/+server.ts (for DELETE)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const { barId, qrId } = params;

		// Delete QR code
		await pool.query('DELETE FROM bar_qr_codes WHERE id = $1 AND bar_id = $2', [qrId, barId]);

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting QR code:', error);
		return json({ success: false, message: 'Failed to delete QR code' }, { status: 500 });
	}
};
