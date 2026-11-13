// routes/api/mobile/bars/[barId]/qrcodes/[qrId]/+server.ts (for DELETE)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { denyUnlessBarManager } from '$lib/server/barAuth';
import { pool } from '$lib/db';

export const DELETE: RequestHandler = async ({ params, request, cookies }) => {
	// Only the venue itself may change it (was open to anyone who knew the id)
	const denied = await denyUnlessBarManager({ params, cookies, request });
	if (denied) return denied;

	try {
		const { barId, qrId } = params;
		// qrId is an integer column; anything else used to reach Postgres and answer 500
		if (!/^[1-9][0-9]{0,9}$/.test(qrId ?? '')) {
			return json({ success: false, message: 'qrId must be a positive integer' }, { status: 400 });
		}

		// Delete QR code
		await pool.query('DELETE FROM clubfindr.bar_qr_codes WHERE id = $1 AND bar_id = $2', [
			qrId,
			barId
		]);

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting QR code:', error);
		return json({ success: false, message: 'Failed to delete QR code' }, { status: 500 });
	}
};
