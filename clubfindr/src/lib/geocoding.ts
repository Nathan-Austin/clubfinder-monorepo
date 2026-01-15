// $lib/server/geocoding.ts
import { VITE_MAPS_API_KEY as GOOGLE_MAPS_API_KEY } from '$env/static/private';

// Cache for geocoding results to avoid redundant API calls
const geocodeCache: Record<string, { latitude: number; longitude: number }> = {};

/**
 * Geocodes an address to coordinates
 */
export async function geocodeAddress(
	address: string,
	city?: string
): Promise<{ latitude: number; longitude: number } | null> {
	// Create a cache key
	const fullAddress = city ? `${address}, ${city}` : address;
	const cacheKey = fullAddress.toLowerCase().trim();

	// Check cache first
	if (geocodeCache[cacheKey]) {
		return geocodeCache[cacheKey];
	}

	try {
		// Encode the address for URL
		const encodedAddress = encodeURIComponent(fullAddress);

		// Make request to Google Geocoding API
		const response = await fetch(
			`https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAPS_API_KEY}`
		);

		const data = await response.json();

		if (data.status === 'OK' && data.results && data.results.length > 0) {
			const { lat, lng } = data.results[0].geometry.location;

			// Store in cache
			const coordinates = { latitude: lat, longitude: lng };
			geocodeCache[cacheKey] = coordinates;

			return coordinates;
		}

		return null;
	} catch (error) {
		console.error('Geocoding error:', error);
		return null;
	}
}
