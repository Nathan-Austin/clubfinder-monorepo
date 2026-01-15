// src/app.d.ts

declare namespace App {
	interface Locals {
		spotifyAccessToken?: string;
		spotifyRefreshToken?: string;
		setCookies?: string[];
		city?: string;
		date?: string;
		address?: string;
		selectedGenre?: string;
		searchQuery?: string;
		user?: {
			id: number;
			email: string;
			name: string;
		};
	}
	// other interfaces like Platform, Session, Stuff can also be declared if needed
}
