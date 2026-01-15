// src/lib/encryptionUtils.ts
import crypto from 'crypto';
import { error } from '@sveltejs/kit';

// Get encryption key from environment variable
// Should be at least 32 bytes (256 bits) for AES-256
const getEncryptionKey = (): Buffer => {
	const key = process.env.VITE_CRYPTO_KEY;

	if (!key || key.length < 32) {
		console.error('Encryption key is missing or too short');
		throw error(500, 'Server configuration error');
	}

	// Ensure key is exactly 32 bytes (256 bits)
	return Buffer.from(crypto.createHash('sha256').update(String(key)).digest('hex'), 'hex').subarray(
		0,
		32
	);
};

/**
 * Encrypts a string value using AES-256-GCM
 * Returns a string in format: iv.authTag.encryptedData (all base64 encoded)
 */
export const encryptToken = (text: string): string => {
	if (!text) {
		throw new Error('Cannot encrypt empty value');
	}

	try {
		// Generate a random initialization vector
		const iv = crypto.randomBytes(16);
		const key = getEncryptionKey();

		// Create cipher using AES-256-GCM (authenticated encryption)
		const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

		// Encrypt the data
		let encryptedData = cipher.update(text, 'utf8', 'base64');
		encryptedData += cipher.final('base64');

		// Get the authentication tag
		const authTag = cipher.getAuthTag().toString('base64');

		// Return iv.authTag.encryptedData
		return `${iv.toString('base64')}.${authTag}.${encryptedData}`;
	} catch (err) {
		console.error('Encryption error:', err);
		throw new Error('Failed to encrypt data');
	}
};

/**
 * Decrypts a string value encrypted with encryptToken
 * Expects string in format: iv.authTag.encryptedData (all base64 encoded)
 */
export const decryptToken = (encryptedText: string): string => {
	if (!encryptedText) {
		throw new Error('Cannot decrypt empty value');
	}

	try {
		// Split the components
		const [ivBase64, authTagBase64, encryptedData] = encryptedText.split('.');

		if (!ivBase64 || !authTagBase64 || !encryptedData) {
			throw new Error('Invalid encrypted format');
		}

		// Convert components from base64
		const iv = Buffer.from(ivBase64, 'base64');
		const authTag = Buffer.from(authTagBase64, 'base64');
		const key = getEncryptionKey();

		// Create decipher
		const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

		// Set authentication tag
		decipher.setAuthTag(authTag);

		// Decrypt the data
		let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
		decrypted += decipher.final('utf8');

		return decrypted;
	} catch (err) {
		console.error('Decryption error:', err);
		throw new Error('Failed to decrypt data');
	}
};
