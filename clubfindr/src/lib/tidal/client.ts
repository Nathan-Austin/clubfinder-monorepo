interface TidalResource {
	id: string;
	type: string;
	attributes: Record<string, any>;
	relationships?: Record<string, any>;
}

interface TidalCollection<T> {
	data: T[];
	links?: Record<string, string>;
	meta?: Record<string, any>;
}

export class TidalClient {
	private readonly baseUrl = 'https://openapi.tidal.com/v1';

	constructor(private accessToken: string) {}

	private getHeaders(): HeadersInit {
		return {
			Authorization: `Bearer ${this.accessToken}`,
			Accept: 'application/vnd.tidal.v1+json',
			'Content-Type': 'application/vnd.tidal.v1+json'
		};
	}

	private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
		const url = path.startsWith('http')
			? path
			: `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

		console.log(`[TidalClient] Requesting: ${url}`);

		const response = await fetch(url, {
			...options,
			headers: {
				...this.getHeaders(),
				...options.headers
			}
		});

		if (!response.ok) {
			const errorBody = await response.text();
			console.error(`[TidalClient] Error ${response.status} for ${url}:`, errorBody);

			if (response.status === 404 || response.status === 403) {
				return { data: [] } as unknown as T;
			}

			throw new Error(`Tidal API error: ${response.status} ${errorBody}`);
		}

		if (response.status === 204) return {} as T;
		return response.json();
	}

	async getMe(): Promise<{ userId: string; countryCode: string }> {
		return this.request('/sessions');
	}

	async getFavoriteArtists(limit: number = 50): Promise<TidalCollection<TidalResource>> {
		return this.request(`/my-collection/artists?page[size]=${limit}`);
	}

	async getFavoriteTracks(limit: number = 50): Promise<TidalCollection<TidalResource>> {
		return this.request(`/my-collection/tracks?page[size]=${limit}`);
	}

	async getFavoritePlaylists(limit: number = 50): Promise<TidalCollection<TidalResource>> {
		return this.request(`/my-collection/playlists?page[size]=${limit}`);
	}

	async getArtist(artistId: string): Promise<TidalResource> {
		return this.request(`/artists/${artistId}`);
	}

	async getArtistAlbums(artistId: string): Promise<TidalCollection<TidalResource>> {
		return this.request(`/artists/${artistId}/albums`);
	}
}
