import type { Handle } from '@sveltejs/kit';
import { query } from '$lib/db';
import { cookieManager } from '$lib/cookieManager';

// Simple in-memory session cache to avoid database hits
const SESSION_CACHE = new Map();
const SESSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Rate limiting for security
const RATE_LIMIT = new Map();
const MAX_REQUESTS = 60; // Max requests per minute
const RESET_INTERVAL = 60 * 1000; // 1 minute

export const handle: Handle = async ({ event, resolve }) => {
	const { url, request } = event;
	const clientIp =
		request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown';

	// Only log non-static requests to reduce noise
	const isStaticAsset =
		url.pathname.startsWith('/assets/') ||
		url.pathname.startsWith('/_app/') ||
		url.pathname.endsWith('.js') ||
		url.pathname.endsWith('.css') ||
		url.pathname.endsWith('.ico');

	if (!isStaticAsset) {
		console.log(`Received request for: ${url.pathname}`);
	}

	// Add rate limiting for security
	if (checkRateLimit(clientIp)) {
		console.warn(`Rate limit exceeded for IP: ${clientIp}`);
		return new Response('Too Many Requests', { status: 429 });
	}

	// Handle common bot requests efficiently
	if (url.pathname === '/robots.txt') {
		return new Response(
			`User-agent: *
			Disallow: /login/
			Disallow: /api/
			Allow: /`,
			{
				headers: { 'Content-Type': 'text/plain' }
			}
		);
	}

	if (
		url.pathname === '/health' ||
		url.pathname === '/actuator/health' ||
		url.pathname === '/actuator/gateway/routes'
	) {
		return new Response(JSON.stringify({ status: 'UP' }), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Block unauthorized paths
	if (
		url.pathname.startsWith('/boaform') ||
		url.pathname.includes('admin') ||
		url.pathname === '/.env' ||
		url.pathname === '/shell' ||
		url.pathname === '/xml' ||
		url.pathname === '/cgi-bin' ||
		url.pathname === '/Account' ||
		url.pathname === '/geoserver' ||
		url.pathname === '/geoserver/web' ||
		url.pathname === '/helpdesk' ||
		url.pathname === '/fog'
	) {
		console.warn(`Blocked unauthorized request to: ${url.pathname}`);
		return new Response('Unauthorized access attempt', { status: 403 });
	}

	// Skip auth middleware for public endpoints to improve performance
	if (url.pathname === '/' || url.pathname.startsWith('/login/') || isStaticAsset) {
		return await resolve(event);
	}
	// Check for API paths that need CORS headers
	if (url.pathname.startsWith('/api/')) {
		// For OPTIONS requests (preflight)
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization',
					'Access-Control-Max-Age': '86400' // 24 hours
				}
			});
		}

		// For actual API requests, continue but make sure to add CORS headers to the response
		const actualResponse = await resolve(event);

		// Create a new response with CORS headers
		const corsResponse = new Response(actualResponse.body, actualResponse);
		corsResponse.headers.set('Access-Control-Allow-Origin', '*');
		corsResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		corsResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

		return corsResponse;
	}
	// For API endpoints that need auth, check the session
	const sessionId = cookieManager.get(event.cookies, 'sessionId');

	if (sessionId) {
		try {
			// Check in-memory cache first
			const now = Date.now();
			let userData = null;

			if (SESSION_CACHE.has(sessionId)) {
				const cachedData = SESSION_CACHE.get(sessionId);
				if (now - cachedData.timestamp < SESSION_CACHE_TTL) {
					userData = cachedData.user;
				}
			}

			// If not in cache, check database
			if (!userData) {
				// Combine queries for better performance
				const sessionQuery = await query(
					`SELECT 
						s.user_id, 
						s.last_accessed, 
						u.id, 
						u.name, 
						u.general_email as email, 
						u.spotify_email,
						u.role
					FROM clubfindr.user_sessions s
					JOIN clubfindr.users u ON s.user_id = u.id
					WHERE s.session_id = $1`,
					[sessionId]
				);

				if (sessionQuery.rows.length === 0) {
					// Invalid or expired session
					cookieManager.delete(event.cookies, 'sessionId', { path: '/' });
					return await resolve(event);
				}

				const session = sessionQuery.rows[0];

				// Check for session timeout
				const lastAccessed = new Date(session.last_accessed);
				const daysSinceLastAccess = (now - lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

				if (daysSinceLastAccess > 7) {
					// Session expired
					await query('DELETE FROM clubfindr.user_sessions WHERE session_id = $1', [sessionId]);
					cookieManager.delete(event.cookies, 'sessionId', { path: '/' });
					return await resolve(event);
				}

				// Prepare user data for cache and locals
				userData = {
					id: session.id,
					name: session.name,
					email: session.email || session.spotify_email,
					...(session.role ? { role: session.role } : {})
				};

				// Cache the user data
				SESSION_CACHE.set(sessionId, {
					timestamp: now,
					user: userData
				});

				// Update last_accessed in background to avoid blocking
				updateLastAccessed(sessionId).catch((err) =>
					console.error('Failed to update last_accessed:', err)
				);
			}

			// Set user in locals
			event.locals.user = userData;
		} catch (error) {
			console.error('Session verification error:', error);
			// Clear invalid session
			cookieManager.delete(event.cookies, 'sessionId', { path: '/' });
		}
	}

	const response = await resolve(event);
	return response;
};

// Background function to update last_accessed
async function updateLastAccessed(sessionId: string) {
	await query('UPDATE clubfindr.user_sessions SET last_accessed = $1 WHERE session_id = $2', [
		new Date().toISOString(),
		sessionId
	]);
}

// Check if user has exceeded rate limit
function checkRateLimit(ip: string) {
	const now = Date.now();

	if (!RATE_LIMIT.has(ip)) {
		RATE_LIMIT.set(ip, { count: 1, lastReset: now });
		return false;
	}

	const record = RATE_LIMIT.get(ip);
	if (now - record.lastReset > RESET_INTERVAL) {
		// Reset counter if interval has passed
		record.count = 1;
		record.lastReset = now;
		return false;
	}

	// Increment counter and check limit
	record.count++;
	return record.count > MAX_REQUESTS;
}
