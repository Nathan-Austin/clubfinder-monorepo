// City names as stored in the database: lower case, whitespace runs as underscores
// ("New York" -> "new_york"). Lived in spotifyUtils until the per-user Spotify code went.

export function normalizeCityName(name: string): string {
	if (!name) {
		throw new Error('City name is undefined or null');
	}

	return name.toLowerCase().replace(/\s+/g, '_');
}
