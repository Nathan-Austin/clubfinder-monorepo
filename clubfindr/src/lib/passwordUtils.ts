// Browser-safe validation helpers, imported by the login, register and password-reset pages.
// Hashing lives in $lib/server/passwordUtils (bcryptjs must not reach the client bundle).

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
