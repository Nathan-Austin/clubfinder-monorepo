// src/app.d.ts

declare namespace App {
	interface Locals {
		setCookies?: string[];
		city?: string;
		date?: string;
		address?: string;
		selectedGenre?: string;
		searchQuery?: string;
		/**
		 * The logged-in user, set by hooks.server.ts from the session (not for /api/*, see
		 * $lib/taste/sessionUser). `id` is users.id, a uuid: it was typed `number` until
		 * 2026-11-14 (KNOWN_ISSUES 40), though it always held the uuid string at runtime.
		 */
		user?: {
			id: string;
			email: string;
			name: string;
			role?: string;
		};
	}
	// other interfaces like Platform, Session, Stuff can also be declared if needed
}
