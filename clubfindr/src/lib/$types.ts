export type SimilarityResult = {
	club_name: string;
	popularity: number;
	price: number;
	genres: string[];
	similarity: number;
	event_image: string;
	event_name: string;
	club_address: string;
	event_id: number;
	matchingGenres: string[];
};
export type BarData = {
	bar_name: string;
	current_track_name: string | null;
	current_track_artist: string | null;
	current_genres: string[];
	popularity: number;
	bar_address: string;
	bar_id: string;
};

export type BarSimilarityResult = BarData & {
	similarity: number;
	matchingGenres: string[];
};
export type Playlist = {
	id: string;
	images: {
		url: string;
		height: number;
		width: number;
	}[];
	name: string;
	tracks: {
		href: string;
		total: number;
	};
	description?: string; // Optional description field for the playlist
	followers?: number; // Optional followers count for the playlist
	external_urls: { spotify: string }; // Spotify API returns external_urls.spotify
};

export type Locals = {
	city?: string;
	date?: string;
	address?: string;
	selectedGenre?: string;
	searchQuery?: string;
	spotifyAccessToken?: string;
	spotifyRefreshToken?: string;
	cookies?: Record<string, string>;
	setCookies?: Record<string, string>;
	user?: {
		id: string;
		name?: string;
		email: string;
		role?: string;
	};
};

export type PlaylistWithArtists = Playlist & {
	artistIds: string[];
};

type PlaylistTrack = {
	track: {
		artists: Artist[];
	};
};

export type PlaylistTracks = {
	items: PlaylistTrack[];
};

export type Artist = {
	genres?: string[];
	id: string;
	images?: {
		url: string;
		height: number;
		width: number;
	}[];
	name: string;
	external_urls: { spotify: string }; // Spotify API returns external_urls.spotify
	selected?: boolean;
};

export type RecentlyPlayedTrack = {
	album?: {
		images?: {
			url: string;
			width: number;
		}[];
		external_urls: { spotify: string };
	};
	artists: { id: string; name: string }[];
	id: string;
	name: string;
	external_urls?: { spotify: string }; // Make sure this remains optional
};

export type Artist_search = {
	genres: string[];
	id: string;
	images: {
		url: string;
		height: number;
		width: number;
	}[];
	name: string;
	selected?: boolean;
	spotifyLink: string; // New property to store the Spotify link
};

export interface SpotifyUserData {
	id?: string; // Spotify user ID
	username?: string; // Optional username (could be null if not available)
	email?: string; // Optional email address (could be null if not available)
	accessToken: string; // Spotify access token
	refreshToken: string; // Spotify refresh token
}

export interface CreateSessionParams {
	sessionId: string; // UUID string for the session
	spotifyUserData: SpotifyUserData; // The user data object containing Spotify info
}

export type DbDataRow = {
	club_name: string;
	popularity: number;
	price: string; // Assuming the price is a string in the database
	event_genres: string[]; // Assuming it's an array of strings
	event_image: string;
	event_name: string;
	club_address: string;
	event_id: number;
};

// New and Extended Types

// Represents a single track in Spotify
export type Track = {
	id: string;
	name: string;
	artists: Artist[];
	album: {
		id: string;
		name: string;
		images: {
			url: string;
			height: number;
			width: number;
		}[];
		external_urls: { spotify: string }; // Spotify link for the album
	};
	selected?: boolean;
	preview_url?: string; // Optional preview URL for the track
	uri: string; // Spotify URI for internal usage in Spotify apps
	external_urls: { spotify: string };
};

// Represents an item in the Spotify playback queue
export type QueueItem = {
	track: Track;
};

// Represents the currently playing track information from Spotify
export type CurrentlyPlaying = {
	item: Track; // The currently playing track
	is_playing: boolean; // Whether the track is currently playing
	progress_ms: number; // Progress into the currently playing track
	context?: {
		type: string; // Context type (e.g., playlist, album)
		uri: string; // Spotify URI of the context
	};
};

// Represents the playback state from Spotify (more comprehensive)
export type PlaybackState = {
	device: {
		id: string;
		is_active: boolean;
		is_private_session: boolean;
		is_restricted: boolean;
		name: string;
		type: string;
		volume_percent: number;
	};
	repeat_state: 'off' | 'track' | 'context';
	shuffle_state: boolean;
	context: {
		uri: string;
		href: string;
		type: string;
	};
	timestamp: number;
	progress_ms: number;
	is_playing: boolean;
	item: Track;
	actions: {
		disallows: {
			pausing: boolean;
			// More actions can be added based on Spotify's API
		};
	};
};

// Represents the full response from the Spotify API for the current playback state
export type SpotifyPlaybackResponse = {
	currently_playing: CurrentlyPlaying;
	queue: QueueItem[];
	recently_played: RecentlyPlayedTrack[];
	top_artists: Artist[];
	top_playlists: Playlist[];
	common_genres: string[];
};
export type Album = {
	id: string;
	name: string;
	images: {
		url: string;
		height: number;
		width: number;
	}[];
	external_urls?: { spotify: string };
	// Add other properties as needed, making them optional if they might be absent
};
// $lib/types.ts

export type spUser = {
	id: number;
	username: string;
	avatar_url: string | null;
	permalink_url: string;
	uri: string;
	city: string | null;
	country: string | null;
	followers_count: number;
	track_count: number;
	playlist_count: number;
	selected?: boolean;
};

export type spTrack = {
	id: number;
	title: string;
	artwork_url: string | null;
	playback_count: number;
	user: spUser;
	genre: string | null;
	tag_list: string | null;
	tags: string[];
	duration: number;
	permalink_url: string;
	created_at: string;
	likes_count: number;
	reposts_count: number;
	selected?: boolean;
};

export type spPlaylist = {
	id: number;
	title: string;
	duration: number;
	genre: string | null;
	tags: string[];
	description: string | null;
	likes_count: number;
	track_count: number;
	user: spUser;
	artwork_url: string | null;
	permalink_url: string;
	created_at: string;
	selected?: boolean;
};

export type spActivity = {
	type: string;
	created_at: string;
	origin: spTrack | null;
	selected?: boolean;
};

export type PerformerTrack = {
	id: string;
	name: string;
	display: string;
	artists?: string[];
	genres?: string[];
};

export type Performer = {
	artist_name: string;
	spotify_uri: string;
	soundcloud_link: string;
	bandcamp_link: string;
	facebook_link: string;
	instagram_link: string;
	ra_link: string;
	genres: string[];
	email: string;
	website: string;
	primary_city: string;
	top_tracks: PerformerTrack[];
};
