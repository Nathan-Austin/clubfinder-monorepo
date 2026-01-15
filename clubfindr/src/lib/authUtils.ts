// lib/authUtils.ts
import { query } from '$lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '$env/static/private';

// Session validation for bar manager accounts
export async function validateBarToken(token: string): Promise<{ barId: string } | null> {
	try {
		// Find the session
		const result = await query(
			'SELECT bar_id, last_accessed FROM clubfindr.bar_sessions WHERE session_id = $1',
			[token]
		);

		if (!result.rows || result.rows.length === 0) {
			return null;
		}

		// Check if session has expired (30 days)
		const lastAccessed = new Date(result.rows[0].last_accessed);
		const now = new Date();
		const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

		if (now.getTime() - lastAccessed.getTime() > thirtyDaysInMs) {
			// Session expired, delete it
			await query('DELETE FROM clubfindr.bar_sessions WHERE session_id = $1', [token]);
			return null;
		}

		// Update last_accessed timestamp in background
		query('UPDATE clubfindr.bar_sessions SET last_accessed = $1 WHERE session_id = $2', [
			new Date().toISOString(),
			token
		]).catch((error) => {
			console.error('Failed to update session timestamp:', error);
		});

		return {
			barId: result.rows[0].bar_id
		};
	} catch (error) {
		console.error('Token validation error:', error);
		return null;
	}
}

// JWT related functions for mobile authentication

/**
 * Generate a JWT token for mobile authentication
 * @param payload Data to include in the token
 * @returns JWT token string
 */
export function generateJWT(payload: {
	userId: string;
	email: string;
	role: string;
	type: 'mobile' | 'web';
}): string {
	// Set token expiration (30 days is typical for mobile)
	const expiresIn = '30d';

	// Create the token with the payload
	return jwt.sign(
		{
			...payload,
			iat: Math.floor(Date.now() / 1000) // Issued at timestamp
		},
		JWT_SECRET,
		{ expiresIn }
	);
}

/**
 * Verify a JWT token
 * @param token JWT token to verify
 * @returns Decoded token payload or null if invalid
 */
export function verifyJWT(token: string): any | null {
	try {
		return jwt.verify(token, JWT_SECRET);
	} catch (error) {
		console.error('JWT verification error:', error);
		return null;
	}
}

/**
 * Create a session for mobile authentication
 * @param userId User or bar ID
 * @param userType Type of user ('bar' or 'customer')
 * @returns Generated token
 */
export async function createMobileSession(
	userId: string,
	userType: 'bar' | 'customer'
): Promise<string> {
	try {
		// Get user info
		let email, role;

		if (userType === 'bar') {
			const result = await query('SELECT general_email FROM clubfindr.bars WHERE id = $1', [
				userId
			]);

			if (!result.rows || result.rows.length === 0) {
				throw new Error('Bar not found');
			}

			email = result.rows[0].general_email;
			role = 'bar';
		} else {
			const result = await query('SELECT general_email FROM clubfindr.users WHERE id = $1', [
				userId
			]);

			if (!result.rows || result.rows.length === 0) {
				throw new Error('User not found');
			}

			email = result.rows[0].general_email;
			role = 'customer';
		}

		// Generate token
		return generateJWT({
			userId,
			email,
			role,
			type: 'mobile'
		});
	} catch (error) {
		console.error('Error creating mobile session:', error);
		throw error;
	}
}
