import type { spTrack, spPlaylist, spUser, spActivity } from '$lib/$types';

export interface PlayHistoryResponse {
	collection: Array<{
		played_at: string;
		track: spTrack;
	}>;
	next_href?: string;
}

export class SoundCloudClient {
	private readonly baseUrl = 'https://api-v2.soundcloud.com';
	private readonly officialBaseUrl = 'https://api.soundcloud.com';
	private readonly defaultClientId = 'EnTrn2ZjaZXfOU7iRsFicZvTOi1Pl3rK';

	constructor(private accessToken: string, private clientId?: string) {
		this.clientId = clientId || this.defaultClientId;
	}

	private getHeaders(): HeadersInit {
		// OAuth 2.0 PKCE tokens are JWTs that require Bearer prefix
		const authHeader =
			this.accessToken.startsWith('OAuth') || this.accessToken.startsWith('Bearer')
				? this.accessToken
				: `Bearer ${this.accessToken}`;

		return {
			Authorization: authHeader,
			Accept: 'application/json'
		};
	}

	private async request<T>(
		path: string,
		options: RequestInit = {},
		useOfficial: boolean = false,
		gracefulErrors: boolean = true
	): Promise<T> {
		const base = useOfficial ? this.officialBaseUrl : this.baseUrl;

		// Add client_id to all requests as it's often required for V2
		const separator = path.includes('?') ? '&' : '?';
		const urlWithId = path.startsWith('http')
			? path
			: `${base}${path.startsWith('/') ? '' : '/'}${path}${separator}client_id=${this.clientId}`;

		console.log(`[SoundCloudClient] Requesting: ${urlWithId}`);

		const response = await fetch(urlWithId, {
			...options,
			headers: {
				...this.getHeaders(),
				...options.headers
			}
		});

		if (!response.ok) {
			const errorBody = await response.text();
			console.error(`[SoundCloudClient] Error ${response.status} for ${urlWithId}:`, errorBody);

			// Return empty collections for common errors to keep the UI functional
			if (gracefulErrors && (response.status === 404 || response.status === 403)) {
				return { collection: [] } as T;
			}

			throw new Error(`SoundCloud API error: ${response.status} ${errorBody}`);
		}

		if (response.status === 204) return {} as T;
		return response.json();
	}

	async getMe(): Promise<spUser> {
		return this.request<spUser>('/me', {}, false, false);
	}

	async getPlayHistory(limit: number = 25, offset: number = 0): Promise<PlayHistoryResponse> {
		return this.request<PlayHistoryResponse>(
			`/me/play-history/tracks?limit=${limit}&offset=${offset}&linked_partitioning=1`
		);
	}

	async getUserTracks(
		userId: number,
		limit: number = 50
	): Promise<{ collection: spTrack[]; next_href?: string }> {
		return this.request(`/users/${userId}/tracks?limit=${limit}&linked_partitioning=1`);
	}

	async getUserPlaylists(
		userId: number,
		limit: number = 50
	): Promise<{ collection: spPlaylist[]; next_href?: string }> {
		return this.request(`/users/${userId}/playlists?limit=${limit}&linked_partitioning=1`);
	}

	async getUserLikes(
		userId: number,
		limit: number = 50
	): Promise<{ collection: (spTrack | spPlaylist)[]; next_href?: string }> {
		return this.request(`/users/${userId}/likes?limit=${limit}&linked_partitioning=1`);
	}

	async getRecentActivities(
		limit: number = 25
	): Promise<{ collection: spActivity[]; next_href?: string }> {
		return this.request(`/activities?limit=${limit}&linked_partitioning=1`);
	}

	async resolve(url: string): Promise<spTrack | spPlaylist | spUser> {
		return this.request(`/resolve?url=${encodeURIComponent(url)}`);
	}

	// For fetching artist details including tags/genres
	async getArtist(userId: number): Promise<spUser & { description?: string; tag_list?: string }> {
		return this.request(`/users/${userId}`);
	}

	async getLikedTracks(limit: number = 30): Promise<{ collection: spTrack[]; next_href?: string }> {
		return this.request(`/me/track_likes?limit=${limit}&linked_partitioning=1`);
	}

	async getLibraryTracks(
		limit: number = 30
	): Promise<{ collection: (spTrack | spPlaylist)[]; next_href?: string }> {
		return this.request(`/me/library/all?limit=${limit}&linked_partitioning=1`);
	}
}
