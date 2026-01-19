// $lib/tempStore.js

import { query } from '$lib/db';

// In-memory storage for compatibility with existing code
const stateMap = new Map();

// Store state in database for persistence
export async function storeState(key: string, value: string) {
	try {
		// Ensure table exists
		try {
			await query(`
        CREATE TABLE IF NOT EXISTS clubfindr.oauth_states (
          key TEXT PRIMARY KEY,
          state_data TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          expires_at TIMESTAMP WITH TIME ZONE
        )
      `);
		} catch (tableError) {
			console.error('Error ensuring oauth_states table exists:', tableError);
		}

		// Set expiry to 1 hour from now
		const expires = new Date();
		expires.setHours(expires.getHours() + 1);

		// Insert the state
		await query(
			`INSERT INTO clubfindr.oauth_states (key, state_data, created_at, expires_at)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (key) DO UPDATE
       SET state_data = $2, created_at = NOW(), expires_at = $3`,
			[key, value, expires.toISOString()]
		);

		// Also store in memory
		stateMap.set(key, value);
		console.log(`State saved with key: ${key}`);
		return true;
	} catch (error) {
		console.error('Error storing state:', error);
		return false;
	}
}

// Original functions your code might be using (sync version)
export function setState(key: string, value: string) {
	stateMap.set(key, value);
	// Also store in database for persistence
	storeState(key, value).catch((err) => console.error('Error persisting state:', err));
	return true;
}

export function getState(key: string) {
	// First try memory
	if (stateMap.has(key)) {
		return stateMap.get(key);
	}

	// If not in memory, this will be null
	// The caller should handle this by using the async version
	return null;
}

// Async version that checks database
export async function getStateAsync(key: string) {
	try {
		// First check memory
		if (stateMap.has(key)) {
			return stateMap.get(key);
		}

		// Then check database
		const result = await query(
			`SELECT state_data FROM clubfindr.oauth_states 
       WHERE key = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
			[key]
		);

		if (result.rows.length > 0) {
			// Store in memory for future quick access
			const stateData = result.rows[0].state_data;
			stateMap.set(key, stateData);
			return stateData;
		}
		return null;
	} catch (error) {
		console.error('Error retrieving state:', error);
		return null;
	}
}

// Clean up state
export async function removeState(key: string) {
	try {
		// Remove from memory
		stateMap.delete(key);

		// Remove from database
		await query('DELETE FROM clubfindr.oauth_states WHERE key = $1', [key]);
		return true;
	} catch (error) {
		console.error('Error removing state:', error);
		return false;
	}
}

// Cleanup expired states
export async function cleanupExpiredStates() {
	try {
		const result = await query(
			'DELETE FROM clubfindr.oauth_states WHERE expires_at < NOW() RETURNING key'
		);

		// Also remove from memory
		for (const row of result.rows) {
			stateMap.delete(row.key);
		}

		return result.rows.length;
	} catch (error) {
		console.error('Error cleaning up expired states:', error);
		return 0;
	}
}
