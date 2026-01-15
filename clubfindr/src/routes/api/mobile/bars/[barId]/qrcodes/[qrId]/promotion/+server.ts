import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/db';
import { sendEmail } from '$lib/email';
import { generateQRCodePDF } from '$lib/pdfUtils';
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const barId = params.barId;
		const qrId = params.qrId;
		const { requestType } = await request.json();

		// Get QR code details from database
		const qrResult = await pool.query('SELECT * FROM bar_qr_codes WHERE id = $1 AND bar_id = $2', [
			qrId,
			barId
		]);

		if (!qrResult.rows.length) {
			return json({ success: false, message: 'QR code not found' }, { status: 404 });
		}

		const qrCode = qrResult.rows[0];

		// Get bar details
		const barResult = await pool.query('SELECT name, general_email FROM bars WHERE id = $1', [
			barId
		]);
		const barName = barResult.rows[0]?.name || '';
		const barEmail = barResult.rows[0]?.general_email;

		if (!barEmail) {
			return json({ success: false, message: 'Bar email not found' }, { status: 404 });
		}

		// Regenerate QR value
		const qrValue = `clubfindr://checkin?barId=${barId}&qrId=${qrId}&type=${
			qrCode.type
		}&barName=${encodeURIComponent(barName)}`;

		// Generate PDF with QR code
		const pdfBuffer = await generateQRCodePDF(qrValue, barName);

		// Create promotion request record
		await pool.query(
			'INSERT INTO promotion_requests (bar_id, qr_id, request_type, qr_value, created_at) VALUES ($1, $2, $3, $4, NOW())',
			[barId, qrId, requestType, qrValue]
		);

		// Send email to admin
		await sendEmail(
			'admin@clubfindr.com',
			'New QR Code Promotion Request',
			`A new QR code promotion request has been received:
			
Bar: ${barName}
Bar ID: ${barId}
QR ID: ${qrId}
Request Type: ${requestType}
QR Value: ${qrValue}`
		);

		// Send email with PDF to bar
		await sendEmail(
			barEmail,
			'Your QR Code Promotion',
			`Here is your QR code for promotion. Please display this prominently in your establishment.
			
Thank you for using ClubFindr!`,
			undefined,
			[
				{
					filename: 'qr-code.pdf',
					content: pdfBuffer
				}
			]
		);

		return json({ success: true });
	} catch (error) {
		console.error('Error creating promotion request:', error);
		return json({ success: false, message: 'Failed to create promotion request' }, { status: 500 });
	}
};
