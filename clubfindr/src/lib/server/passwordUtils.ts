import bcryptjs from 'bcryptjs';
import { validatePassword } from '$lib/passwordUtils';

const saltRounds = 10;

export async function hashPassword(plainPassword: string): Promise<string> {
	const validation = validatePassword(plainPassword);
	if (!validation.isValid) {
		throw new Error(validation.errors.join(', '));
	}
	const salt = await bcryptjs.genSalt(saltRounds);
	const hashedPassword = await bcryptjs.hash(plainPassword, salt);
	return hashedPassword;
}

export async function comparePassword(
	plainPassword: string,
	hashedPassword: string
): Promise<boolean> {
	return bcryptjs.compareSync(plainPassword, hashedPassword);
}

export function generateTemporaryPassword(): string {
	const length = 16;
	const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
	let password = '';

	// Ensure at least one of each required character type
	password += 'A'; // uppercase
	password += 'a'; // lowercase
	password += '1'; // number
	password += '!'; // special char

	// Fill the rest randomly
	for (let i = password.length; i < length; i++) {
		const randomIndex = Math.floor(Math.random() * charset.length);
		password += charset[randomIndex];
	}

	// Shuffle the password
	return password
		.split('')
		.sort(() => Math.random() - 0.5)
		.join('');
}
