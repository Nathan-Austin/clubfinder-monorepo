// src/routes/api/soundcloud/auth.ts
// src/routes/api/soundcloud/auth/+server.ts
import { redirect } from '@sveltejs/kit';

export const GET = async () => {
	const client_id = import.meta.env.VITE_SOUNDCLOUD_CLIENT_ID;
	const redirect_uri = 'https://www.clubfindr.com/api/soundcloud/callback';

	// Add all required scopes
	const scopes = [
		'non-expiring',
		'playlists',
		'playlists-modify',
		'activities',
		'likes',
		'following',
		'upload',
		'tracks'
	].join(' ');

	const soundcloudAuthUrl =
		`https://soundcloud.com/connect` +
		`?client_id=${client_id}` +
		`&response_type=code` +
		`&redirect_uri=${encodeURIComponent(redirect_uri)}` +
		`&scope=${encodeURIComponent(scopes)}`;

	throw redirect(302, soundcloudAuthUrl);
};
