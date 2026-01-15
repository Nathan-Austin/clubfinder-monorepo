// src/lib/validators/barValidators.ts

/**
 * Validates a telephone number
 * @param telephone The telephone number to validate
 * @returns True if the telephone number is valid, false otherwise
 */
export function isValidTelephone(telephone: string): boolean {
	// Remove all non-numeric characters
	const digitsOnly = telephone.replace(/\D/g, '');

	// Check if the result has a valid length (usually between 7 and 15 digits)
	return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

/**
 * Validates an email address
 * @param email The email address to validate
 * @returns True if the email address is valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
	// Basic email validation regex
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

/**
 * Validates a bar update payload
 * @param data The bar update data
 * @returns An array of validation errors, empty if valid
 */
export function validateBarUpdate(data: any): string[] {
	const errors: string[] = [];

	// Check required fields
	if (!data.name || data.name.trim() === '') {
		errors.push('Bar name is required');
	}

	if (!data.address || data.address.trim() === '') {
		errors.push('Address is required');
	}

	if (!data.city || data.city.trim() === '') {
		errors.push('City is required');
	}

	if (!data.phone) {
		errors.push('Telephone number is required');
	} else if (!isValidTelephone(data.phone)) {
		errors.push('Please enter a valid telephone number');
	}

	if (!data.general_email) {
		errors.push('Email address is required');
	} else if (!isValidEmail(data.general_email)) {
		errors.push('Please enter a valid email address');
	}

	// Check field lengths
	if (data.name && data.name.length > 100) {
		errors.push('Bar name must be 100 characters or less');
	}

	if (data.address && data.address.length > 255) {
		errors.push('Address must be 255 characters or less');
	}

	if (data.city && data.city.length > 100) {
		errors.push('City must be 100 characters or less');
	}

	if (data.description && data.description.length > 1000) {
		errors.push('Description must be 1000 characters or less');
	}

	return errors;
}
