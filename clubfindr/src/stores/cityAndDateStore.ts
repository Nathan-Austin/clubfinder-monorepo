import { writable } from 'svelte/store';

export const formDataStore = writable({
	citystore: '',
	selectedGenres: '',
	address: '',
	formattedDatestore: ''
});
