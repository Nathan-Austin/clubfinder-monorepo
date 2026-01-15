// src/lib/cookieManager.ts
import { encryptToken, decryptToken } from './encryptionUtils';
import type { Cookies } from '@sveltejs/kit';

interface CookieOptions {
	path: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: 'lax' | 'strict' | 'none';
	maxAge?: number;
}

/**
 * Secure cookie manager that automatically encrypts/decrypts cookie values
 */
export const cookieManager = {
	/**
	 * Set an encrypted cookie
	 */
	set: (cookies: Cookies, name: string, value: string, options: Partial<CookieOptions> = {}) => {
		if (!value) {
			console.warn(`Attempted to set empty cookie value for ${name}`);
			return;
		}

		try {
			// Always encrypt all cookie values
			const encryptedValue = encryptToken(value);

			// Merge with default options, ensuring path is set
			const secureOptions: CookieOptions = {
				httpOnly: true,
				secure: true,
				sameSite: 'lax' as const,
				...options,
				path: options.path || '/'
			};

			cookies.set(name, encryptedValue, secureOptions);
		} catch (error) {
			console.error(`Error setting cookie ${name}:`, error);
		}
	},

	/**
	 * Get and decrypt a cookie value
	 */
	get: (cookies: Cookies, name: string): string | null => {
		const encryptedValue = cookies.get(name);

		if (!encryptedValue) {
			return null;
		}

		try {
			return decryptToken(encryptedValue);
		} catch (error) {
			console.error(`Error decrypting cookie ${name}:`, error);
			// Delete the corrupt cookie
			cookies.delete(name, { path: '/' });
			return null;
		}
	},

	/**
	 * Delete a cookie
	 */
	delete: (cookies: Cookies, name: string, options: Partial<CookieOptions> = {}) => {
		const deleteOptions: CookieOptions = {
			...options,
			path: options.path || '/'
		};

		cookies.delete(name, deleteOptions);
	}
};
