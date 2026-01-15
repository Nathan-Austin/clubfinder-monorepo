import { writable } from 'svelte/store';

// Create a writable store for genres
export const genresStore = writable<Set<string>>(new Set());
