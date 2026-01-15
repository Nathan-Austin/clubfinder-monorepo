import bcryptjs from 'bcryptjs';

const saltRounds = 10;

interface PasswordValidationResult {
	isValid: boolean;
	errors: string[];
}

export function validateEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

export function validatePassword(password: string): PasswordValidationResult {
	const errors: string[] = [];

	// Length check
	if (password.length < 8) {
		errors.push('Password must be at least 8 characters long');
	}
	if (password.length > 128) {
		errors.push('Password must not exceed 128 characters');
	}

	// Complexity checks
	if (!/[A-Z]/.test(password)) {
		errors.push('Password must contain at least one uppercase letter');
	}
	if (!/[a-z]/.test(password)) {
		errors.push('Password must contain at least one lowercase letter');
	}
	if (!/[0-9]/.test(password)) {
		errors.push('Password must contain at least one number');
	}
	if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
		errors.push('Password must contain at least one special character (!@#$%^&*(),.?":{}|<>)');
	}

	// Common password patterns check
	const commonPatterns = [
		'123456',
		'password',
		'qwerty',
		'abc123',
		'admin123',
		'welcome',
		'letmein',
		'monkey'
	];
	if (commonPatterns.some((pattern) => password.toLowerCase().includes(pattern))) {
		errors.push('Password contains common patterns that are easily guessed');
	}

	return {
		isValid: errors.length === 0,
		errors
	};
}

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
