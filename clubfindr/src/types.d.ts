// Import necessary types from SvelteKit
import { Locals as OriginalLocals } from '@sveltejs/kit';

// Extend the Locals type to include the cookies property
declare module '@sveltejs/kit' {
	interface Locals extends OriginalLocals {
		cookies?: {
			city?: string;
			formattedDate?: string;
			address?: string;
			selectedGenre?: string;
		};
	}
}
