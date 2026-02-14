import type { spTrack, spPlaylist, spUser, spActivity } from '$lib/$types';

type ApiTarget = 'v2-auth' | 'v2-public';

export class SoundCloudClient {
	private readonly v2BaseUrl = 'https://api-v2.soundcloud.com';
	// Web-extracted client_id that works with v2 public API
	private readonly webClientId = 'EnTrn2ZjaZXfOU7iRsFicZvTOi1Pl3rK';
	// OAuth app client_id for authenticated requests
	private readonly appClientId: string;

	constructor(private accessToken: string, clientId?: string) {
		this.appClientId = clientId || this.webClientId;
	}

	private getV2AuthHeaders(): HeadersInit {
		return {
			Authorization: `OAuth ${this.accessToken}`,
			Accept: 'application/json, text/javascript, */*; q=0.01',
			'User-Agent':
				'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
			Origin: 'https://soundcloud.com',
			Referer: 'https://soundcloud.com/'
		};
	}

	private getV2PublicHeaders(): HeadersInit {
		return {
			Accept: 'application/json, text/javascript, */*; q=0.01',
			'User-Agent':
				'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
			Origin: 'https://soundcloud.com',
			Referer: 'https://soundcloud.com/'
		};
	}

	private async request<T>(
		path: string,
		options: RequestInit = {},
		target: ApiTarget = 'v2-auth',
		gracefulErrors: boolean = true
	): Promise<T> {
		const headers = target === 'v2-auth' ? this.getV2AuthHeaders() : this.getV2PublicHeaders();
		// Use OAuth app client_id for auth requests, web client_id for public requests
		const clientId = target === 'v2-auth' ? this.appClientId : this.webClientId;

		const separator = path.includes('?') ? '&' : '?';
		const urlWithId = path.startsWith('http')
			? path
			: `${this.v2BaseUrl}${
					path.startsWith('/') ? '' : '/'
			  }${path}${separator}client_id=${clientId}`;

		console.log(`[SoundCloudClient] ${target} → ${urlWithId}`);

		const response = await fetch(urlWithId, {
			...options,
			headers: {
				...headers,
				...options.headers
			}
		});

		if (!response.ok) {
			const errorBody = await response.text();
			console.error(`[SoundCloudClient] Error ${response.status} for ${urlWithId}:`, errorBody);

			if (gracefulErrors && (response.status === 404 || response.status === 403)) {
				return { collection: [] } as T;
			}

			throw new Error(`SoundCloud API error: ${response.status} ${errorBody}`);
		}

		if (response.status === 204) return {} as T;
		return response.json();
	}

	// --- Authenticated user endpoints (try v2 with OAuth JWT, fallback to JWT decode) ---

	async getMe(): Promise<spUser> {
		// Try v2 with OAuth token first
		try {
			const result = await this.request<spUser>('/me', {}, 'v2-auth', false);
			if (result?.id) return result;
		} catch (err) {
			console.log('[SoundCloudClient] /me failed with auth, trying JWT decode fallback');
		}

		// Fallback: decode user ID from JWT and fetch public profile
		const userId = SoundCloudClient.decodeJwtUserId(this.accessToken);
		if (userId) {
			console.log(`[SoundCloudClient] Decoded user ID from JWT: ${userId}`);
			return this.request<spUser>(`/users/${userId}`, {}, 'v2-public', false);
		}

		throw new Error('Cannot determine user identity: /me failed and JWT decode failed');
	}

	async getLikedTracks(limit: number = 30): Promise<{ collection: spTrack[]; next_href?: string }> {
		// Try authenticated first, fall back to public endpoint with user ID
		try {
			return await this.request(
				`/me/track_likes?limit=${limit}&linked_partitioning=1`,
				{},
				'v2-auth'
			);
		} catch {
			// Will return empty via graceful error handling
			return { collection: [] };
		}
	}

	async getUserPlaylists(
		userId: number,
		limit: number = 50
	): Promise<{ collection: spPlaylist[]; next_href?: string }> {
		// Use public endpoint — works without auth
		return this.request(
			`/users/${userId}/playlists?limit=${limit}&linked_partitioning=1`,
			{},
			'v2-public'
		);
	}

	async getRecentActivities(
		limit: number = 25
	): Promise<{ collection: spActivity[]; next_href?: string }> {
		return this.request(`/me/activities?limit=${limit}&linked_partitioning=1`, {}, 'v2-auth');
	}

	async getUserLikes(
		userId: number,
		limit: number = 50
	): Promise<{ collection: spTrack[]; next_href?: string }> {
		return this.request(
			`/users/${userId}/likes?limit=${limit}&linked_partitioning=1`,
			{},
			'v2-public'
		);
	}

	// --- V2 Public API (unauthenticated, client_id only) ---

	async getArtist(userId: number): Promise<spUser & { description?: string; tag_list?: string }> {
		return this.request(`/users/${userId}`, {}, 'v2-public');
	}

	async getUserTracks(
		userId: number,
		limit: number = 50
	): Promise<{ collection: spTrack[]; next_href?: string }> {
		return this.request(
			`/users/${userId}/tracks?limit=${limit}&linked_partitioning=1`,
			{},
			'v2-public'
		);
	}

	async resolve(url: string): Promise<spTrack | spPlaylist | spUser> {
		return this.request(`/resolve?url=${encodeURIComponent(url)}`, {}, 'v2-public');
	}

	// --- Utilities ---

	static parseTagList(tagList: string): string[] {
		if (!tagList) return [];
		const matches = tagList.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
		return matches.map((t) => t.replace(/"/g, '').trim()).filter(Boolean);
	}

	static decodeJwtUserId(token: string): number | null {
		try {
			const parts = token.split('.');
			if (parts.length !== 3) return null;
			const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
			console.log('[SoundCloudClient] JWT claims:', Object.keys(payload).join(', '));
			// SoundCloud JWT uses 'sub' for user URN like "soundcloud:users:123456"
			const sub = payload.sub || payload.user_id || payload.uid;
			if (typeof sub === 'number') return sub;
			if (typeof sub === 'string') {
				const match = sub.match(/(\d+)$/);
				if (match) return parseInt(match[1], 10);
			}
			return null;
		} catch (err) {
			console.error('[SoundCloudClient] JWT decode failed:', err);
			return null;
		}
	}
}
