// src/lib/pdfUtils.ts
// This file contains utility functions for generating PDFs, including QR codes.

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export async function generateQRCodePDF(qrValue: string, barName: string): Promise<Buffer> {
	// Create a new PDF document
	const doc = new PDFDocument({
		size: 'A4',
		margin: 30
	});

	// Create a buffer to store the PDF
	const buffers: Buffer[] = [];
	doc.on('data', buffers.push.bind(buffers));

	// PDF dimensions (A4 = 595.28 x 841.89 points)
	const pageWidth = doc.page.width - 2 * 30; // Subtract margins
	const pageHeight = doc.page.height - 2 * 30; // Subtract margins

	// Grid settings
	const columns = 2;
	const rows = 3;
	const qrWidth = (pageWidth / columns) * 0.8; // 80% of available column width
	const qrHeight = (pageHeight / rows) * 0.6; // 60% of available row height
	const cellWidth = pageWidth / columns;
	const cellHeight = pageHeight / rows;

	// Generate QR code as data URL once
	const qrDataUrl = await QRCode.toDataURL(qrValue, {
		width: Math.min(qrWidth, qrHeight), // Use smaller dimension to keep aspect ratio
		margin: 1
	});

	// Add page title
	doc
		.fontSize(18)
		.text(`QR Codes for ${barName}`, {
			align: 'center'
		})
		.moveDown(1);

	// Create 2x3 grid of QR codes
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < columns; col++) {
			// Calculate position for current cell
			const x = 30 + col * cellWidth + (cellWidth - qrWidth) / 2;
			const y = 60 + row * cellHeight;

			// Add top text
			doc.fontSize(12).text(`Hunt down your vibe`, x, y, {
				width: qrWidth,
				align: 'center'
			});

			// Add QR code image
			doc.image(qrDataUrl, x, y + 20, {
				fit: [qrWidth, qrHeight],
				align: 'center'
			});

			// Add bottom text
			doc.fontSize(10).text('Scan with the Tilki app', x, y + 20 + qrHeight + 5, {
				width: qrWidth,
				align: 'center'
			});
		}
	}

	// Finalize the PDF
	doc.end();

	// Return a promise that resolves with the complete PDF data
	return new Promise((resolve) => {
		doc.on('end', () => {
			resolve(Buffer.concat(buffers.map((buffer) => Uint8Array.from(buffer))));
		});
	});
}

// For multiple bars, each with their own QR code
export async function generateMultipleQRCodePDF(
	qrData: { qrValue: string; barName: string }[]
): Promise<Buffer> {
	// Create a new PDF document
	const doc = new PDFDocument({
		size: 'A4',
		margin: 30
	});

	// Create a buffer to store the PDF
	const buffers: Buffer[] = [];
	doc.on('data', buffers.push.bind(buffers));

	// PDF dimensions (A4 = 595.28 x 841.89 points)
	const pageWidth = doc.page.width - 2 * 30; // Subtract margins
	const pageHeight = doc.page.height - 2 * 30; // Subtract margins

	// Grid settings
	const columns = 2;
	const rows = 3;
	const qrWidth = (pageWidth / columns) * 0.8; // 80% of available column width
	const qrHeight = (pageHeight / rows) * 0.6; // 60% of available row height
	const cellWidth = pageWidth / columns;
	const cellHeight = pageHeight / rows;

	// Add page title
	doc
		.fontSize(18)
		.text('ClubFindr QR Codes', {
			align: 'center'
		})
		.moveDown(1);

	// Track current position in grid
	let currentRow = 0;
	let currentCol = 0;
	let currentPage = 1;

	// Generate QR codes for each bar
	for (let i = 0; i < qrData.length; i++) {
		const { qrValue, barName } = qrData[i];

		// Create a new page if we've filled the current one
		if (i > 0 && i % (rows * columns) === 0) {
			doc.addPage();
			currentPage++;
			currentRow = 0;
			currentCol = 0;

			// Add page title to new page
			doc
				.fontSize(18)
				.text('ClubFindr QR Codes', {
					align: 'center'
				})
				.moveDown(1);
		}

		// Generate QR code for this bar
		const qrDataUrl = await QRCode.toDataURL(qrValue, {
			width: Math.min(qrWidth, qrHeight),
			margin: 1
		});

		// Calculate position for current cell
		const x = 30 + currentCol * cellWidth + (cellWidth - qrWidth) / 2;
		const y = 60 + currentRow * cellHeight;

		// Add top text
		doc.fontSize(12).text(`${barName}`, x, y, {
			width: qrWidth,
			align: 'center'
		});

		// Add QR code image
		doc.image(qrDataUrl, x, y + 20, {
			fit: [qrWidth, qrHeight],
			align: 'center'
		});

		// Add bottom text
		doc.fontSize(10).text('Scan with ClubFindr app', x, y + 20 + qrHeight + 5, {
			width: qrWidth,
			align: 'center'
		});

		// Update position for next QR code
		currentCol++;
		if (currentCol >= columns) {
			currentCol = 0;
			currentRow++;
		}
	}

	// Finalize the PDF
	doc.end();

	// Return a promise that resolves with the complete PDF data
	return new Promise((resolve) => {
		doc.on('end', () => {
			resolve(Buffer.concat(buffers.map((buffer) => Uint8Array.from(buffer))));
		});
	});
}
