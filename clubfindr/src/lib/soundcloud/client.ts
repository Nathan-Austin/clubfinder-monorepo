import type { spTrack } from '$lib/$types';

export interface PlayHistoryResponse {
	collection: Array<{
		played_at: string;
		track: spTrack;
	}>;
	next_href?: string;
}

export class SoundCloudClient {
	private readonly baseUrl = 'https://api-v2.soundcloud.com';
	private readonly appVersion = '1731681989';

	constructor(private readonly accessToken: string, private readonly clientId: string) {}

	private getBrowserHeaders(): HeadersInit {
		return {
			Host: 'api-v2.soundcloud.com',
			'User-Agent':
				'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
			Accept: 'application/json, text/javascript, */*; q=0.01',
			'Accept-Language': 'en-US,en;q=0.5',
			'Accept-Encoding': 'gzip, deflate, br, zstd',
			Referer: 'https://soundcloud.com/',
			Origin: 'https://soundcloud.com',
			'Sec-Fetch-Dest': 'empty',
			'Sec-Fetch-Mode': 'cors',
			'Sec-Fetch-Site': 'same-site',
			Authorization: `Bearer ${this.accessToken}`,
			Connection: 'keep-alive',
			// Added additional headers that might help
			'X-Request-Id': crypto.randomUUID(),
			'If-None-Match': 'W/"c6bbb-qA8/K/QEsifCdiJVQJLi6MhqGik"'
		};
	}

	async getPlayHistory(limit: string = '25', offset: string = '0'): Promise<PlayHistoryResponse> {
		try {
			// Removed client_id from query params since we're using bearer auth
			const queryParams = new URLSearchParams({
				limit,
				offset,
				linked_partitioning: '1',
				app_version: this.appVersion,
				app_locale: 'en'
			});

			const url = `${this.baseUrl}/me/play-history/tracks?${queryParams.toString()}`;

			console.log('Making request to:', url);
			console.log('With headers:', this.getBrowserHeaders());

			const response = await fetch(url, {
				method: 'GET',
				headers: this.getBrowserHeaders(),
				credentials: 'include',
				mode: 'cors'
			});

			console.log('Response status:', response.status);
			console.log('Response headers:', Object.fromEntries(response.headers));

			const responseBody = await response.text();
			console.log('Response body:', responseBody);

			if (!response.ok) {
				// Add more detailed error logging
				console.error('Request failed with status:', response.status);
				console.error('Response headers:', Object.fromEntries(response.headers));
				console.error('Response body:', responseBody);
				throw new Error(`HTTP error! status: ${response.status}, body: ${responseBody}`);
			}

			if (response.status === 204 || !responseBody) {
				return { collection: [] };
			}

			return JSON.parse(responseBody);
		} catch (error) {
			console.error('Play history request failed:', error);
			throw error;
		}
	}
}
