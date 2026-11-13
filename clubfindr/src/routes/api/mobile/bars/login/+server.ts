// api/mobile/bar/login/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/db';
import { comparePassword } from '$lib/server/passwordUtils';
import { v4 as uuidv4 } from 'uuid';

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();
	console.log('========================');
	console.log('MOBILE BAR LOGIN REQUEST');
	console.log('========================');

	try {
		// Parse request body
		const data = await request.json();
		console.log('Request parsing:', Date.now() - startTime, 'ms');

		const { email, password, platform, version } = data;

		// Basic validation
		if (!email || !password) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Missing email or password'
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Get bar manager from database with all relevant fields
		const dbStart = Date.now();
		const result = await query(
			`SELECT 
                b.id, b.password_hash, b.city, b.name, b.general_email,
                b.address, b.phone, b.opening_hours, b.closing_hours, b.description, b.website,
                b.confirmed as email_verified, b.contact_person, b.postcode
             FROM clubfindr.bars b
             WHERE b.general_email = $1`,
			[email]
		);
		console.log('Database lookup:', Date.now() - dbStart, 'ms');

		if (!result.rows || result.rows.length === 0) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Invalid credentials'
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		const barData = result.rows[0];

		// Check if email is verified
		if (!barData.email_verified) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Email not verified. Please check your email for verification instructions.'
				}),
				{
					status: 403,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}
		// Check password
		const passwordStart = Date.now();
		const storedHashedPassword = barData.password_hash;
		const isPasswordCorrect = await comparePassword(password, storedHashedPassword);
		console.log('Password verification:', Date.now() - passwordStart, 'ms');

		if (!isPasswordCorrect) {
			return new Response(
				JSON.stringify({
					success: false,
					message: 'Invalid credentials'
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		// Generate token for mobile session
		const tokenStart = Date.now();
		const barId = barData.id;
		const sessionId = uuidv4();
		console.log('Token generation:', Date.now() - tokenStart, 'ms');

		// Prepare bar data for response
		const barDataResponse = {
			id: barId,
			name: barData.name,
			address: barData.address || null,
			postcode: barData.postcode || null,
			city: barData.city,
			email: barData.general_email,
			phone: barData.phone || null,
			contact_person: barData.contact_person,
			description: barData.description || null,
			opening_hours: barData.opening_hours || null,
			closing_hours: barData.closing_hours || null,
			website: barData.website || null
		};

		// The token is only good once its bar_sessions row exists, so write it before answering:
		// done in the background, the app's first authenticated request could arrive first and
		// be refused. createBarSession logs its own errors and never throws.
		await createBarSession(sessionId, barId, platform, version);

		// No Spotify block any more: it carried the venue's decrypted Spotify tokens and its
		// app's client secret to the device (venue Spotify connect is retired)
		const responseBody = {
			success: true,
			token: sessionId,
			barData: barDataResponse
		};

		console.log('Total processing time:', Date.now() - startTime, 'ms');
		// Return success response immediately
		return new Response(JSON.stringify(responseBody), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Bar login error:', error);
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

// Background function to create bar session without blocking the response
async function createBarSession(
	sessionId: string,
	barId: string,
	platform?: string,
	version?: string
) {
	const startTime = Date.now();
	try {
		// One app session per venue: replace the previous app session. Only the app's
		// (is_mobile): the web dashboard keeps its own session in the same table since
		// 2026-11-13, and an app login must not log the venue out of the dashboard.
		await query('DELETE FROM clubfindr.bar_sessions WHERE bar_id = $1 AND is_mobile', [barId]);
		console.log(`Session deletion took: ${Date.now() - startTime}ms`);

		// Create the new session
		const insertStart = Date.now();
		await query(
			`
            INSERT INTO clubfindr.bar_sessions (
                session_id, 
                bar_id,
                last_accessed,
                platform,
                version,
                is_mobile
            ) VALUES ($1, $2, $3, $4, $5, $6)
            `,
			[
				sessionId,
				barId,
				new Date().toISOString(),
				platform || 'unknown',
				version || 'unknown',
				true
			]
		);
		console.log(`Session creation took: ${Date.now() - insertStart}ms`);
		console.log(`Total background session handling: ${Date.now() - startTime}ms`);
	} catch (error) {
		console.error('Bar session creation error:', error);
	}
}
