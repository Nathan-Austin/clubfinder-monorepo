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
export function validateBarUpdate(data: Record<string, unknown>): string[] {
	const errors: string[] = [];

	const name = typeof data.name === 'string' ? data.name : '';
	const address = typeof data.address === 'string' ? data.address : '';
	const city = typeof data.city === 'string' ? data.city : '';
	const phone = typeof data.phone === 'string' ? data.phone : '';
	const general_email = typeof data.general_email === 'string' ? data.general_email : '';
	const description = typeof data.description === 'string' ? data.description : '';

	// Check required fields
	if (!name || name.trim() === '') {
		errors.push('Bar name is required');
	}

	if (!address || address.trim() === '') {
		errors.push('Address is required');
	}

	if (!city || city.trim() === '') {
		errors.push('City is required');
	}

	if (!phone) {
		errors.push('Telephone number is required');
	} else if (!isValidTelephone(phone)) {
		errors.push('Please enter a valid telephone number');
	}

	if (!general_email) {
		errors.push('Email address is required');
	} else if (!isValidEmail(general_email)) {
		errors.push('Please enter a valid email address');
	}

	// Check field lengths
	if (name && name.length > 100) {
		errors.push('Bar name must be 100 characters or less');
	}

	if (address && address.length > 255) {
		errors.push('Address must be 255 characters or less');
	}

	if (city && city.length > 100) {
		errors.push('City must be 100 characters or less');
	}

	if (description && description.length > 1000) {
		errors.push('Description must be 1000 characters or less');
	}

	return errors;
}
