import { SvelteSet } from 'svelte/reactivity';

// Shared set of genres (was a writable<Set<string>> store). A SvelteSet is reactive in
// templates and $derived/$effect, so consumers read it directly instead of subscribing.
export const genres = new SvelteSet<string>();
