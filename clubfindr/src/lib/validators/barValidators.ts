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

export function validateBarUpdate(
	data: Record<string, unknown>,
	isPartial: boolean = false
): string[] {
	const errors: string[] = [];

	// Check required fields (only for full updates)
	if (!isPartial) {
		if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
			errors.push('Bar name is required');
		}
		if (!data.address || typeof data.address !== 'string' || data.address.trim() === '') {
			errors.push('Address is required');
		}
		if (!data.city || typeof data.city !== 'string' || data.city.trim() === '') {
			errors.push('City is required');
		}
		if (!data.phone || typeof data.phone !== 'string') {
			errors.push('Telephone number is required');
		}
		if (!data.general_email || typeof data.general_email !== 'string') {
			errors.push('Email address is required');
		}
	}

	// Validate fields if they are present
	if (data.name !== undefined) {
		const name = typeof data.name === 'string' ? data.name : '';
		if (name.length > 100) {
			errors.push('Bar name must be 100 characters or less');
		}
		if (isPartial && name.trim() === '') {
			errors.push('Bar name cannot be empty');
		}
	}

	if (data.address !== undefined) {
		const address = typeof data.address === 'string' ? data.address : '';
		if (address.length > 255) {
			errors.push('Address must be 255 characters or less');
		}
		if (isPartial && address.trim() === '') {
			errors.push('Address cannot be empty');
		}
	}

	if (data.city !== undefined) {
		const city = typeof data.city === 'string' ? data.city : '';
		if (city.length > 100) {
			errors.push('City must be 100 characters or less');
		}
		if (isPartial && city.trim() === '') {
			errors.push('City cannot be empty');
		}
	}

	if (data.phone !== undefined) {
		const phone = typeof data.phone === 'string' ? data.phone : '';
		if (phone && !isValidTelephone(phone)) {
			errors.push('Please enter a valid telephone number');
		}
		if (isPartial && !phone) {
			errors.push('Telephone number cannot be empty');
		}
	}

	if (data.general_email !== undefined) {
		const email = typeof data.general_email === 'string' ? data.general_email : '';
		if (email && !isValidEmail(email)) {
			errors.push('Please enter a valid email address');
		}
		if (isPartial && !email) {
			errors.push('Email address cannot be empty');
		}
	}

	if (data.description !== undefined) {
		const description = typeof data.description === 'string' ? data.description : '';
		if (description.length > 1000) {
			errors.push('Description must be 1000 characters or less');
		}
	}

	return errors;
}
