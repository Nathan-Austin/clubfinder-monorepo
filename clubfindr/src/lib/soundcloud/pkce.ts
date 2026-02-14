import { webcrypto } from 'node:crypto';

/**
 * Generates a random string for use as a PKCE code verifier or state.
 */
export function generateRandomString(length: number): string {
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
	const values = webcrypto.getRandomValues(new Uint8Array(length));
	return Array.from(values)
		.map((x) => possible[x % possible.length])
		.join('');
}

/**
 * Generates a PKCE code challenge from a code verifier.
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(codeVerifier);
	const hashBuffer = await webcrypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashBase64 = btoa(String.fromCharCode(...hashArray));
	
	// Convert to base64url
	return hashBase64
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

