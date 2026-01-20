<!-- ArtistSearchForm.svelte -->
<script lang="ts">
	import { Search, Loader } from 'lucide-svelte';
	import GenreSelector from './GenreSelector.svelte';
	import TrackSearch from './TrackSearch.svelte';
	import { slide } from 'svelte/transition';
	import pkg from 'lodash';
	import type { Performer, PerformerTrack } from '$lib/$types';
	const { debounce } = pkg;

	export let handleArtistComplete: (index: number, artistData: Performer) => void;
export let initialData: Performer | null = null;
	export let index: number;
	export let expanded = false;

	let searchTerm = '';
	let isSearching = false;
	let searchResults: Performer[] = [];
	let searchError = '';

	let formData: Performer = initialData || {
		artist_name: '',
		email: '',
		spotify_uri: '',
		soundcloud_link: '',
		bandcamp_link: '',
		facebook_link: '',
		instagram_link: '',
		ra_link: '',
		genres: [],
		website: '',
		primary_city: '',
		top_tracks: []
	};

	const debouncedSearch = debounce(async (term: string) => {
		if (!term.trim()) {
			searchResults = [];
			return;
		}

		isSearching = true;
		searchError = '';

		try {
			const response = await fetch(`/api/artists/search?term=${encodeURIComponent(term)}`);
			if (!response.ok) throw new Error('Search failed');

			const data = await response.json();
			searchResults = data;

			if (data.length === 0) {
				searchResults = [];
			}
		} catch (error) {
			console.error('Search error:', error);
			searchError = 'Failed to search artists. Please try again.';
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}, 300);

	function selectArtist(artist: Performer) {
		formData = {
			artist_name: artist.artist_name || '',
			email: artist.email || '',
			spotify_uri: artist.spotify_uri || '',
			soundcloud_link: artist.soundcloud_link || '',
			bandcamp_link: artist.bandcamp_link || '',
			facebook_link: artist.facebook_link || '',
			instagram_link: artist.instagram_link || '',
			ra_link: artist.ra_link || '',
			genres: artist.genres || [],
			website: artist.website || '',
			primary_city: artist.primary_city || '',
			top_tracks: Array(5).fill({ id: '', name: '', display: '' })
		};
		searchResults = [];
		expanded = true; // Ensure form stays expanded when selecting artist
		handleArtistComplete(index, formData);
	}

	function clearSearch() {
		searchTerm = '';
		searchResults = [];
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	function handleTrackSelect(
		trackIndex: number,
		track: { id: string; name: string; artists: string[]; genres: string[] }
	) {
		formData.top_tracks[trackIndex] = {
			id: track.id,
			name: track.name,
			display: `${track.name} - ${track.artists.join(', ')}`,
			artists: track.artists,
			genres: track.genres
		};
		handleArtistComplete(index, formData);
	}
	function handleTracksChange(tracks: PerformerTrack[]) {
		formData.top_tracks = tracks;
		// Just update the form data without collapsing
		handleArtistComplete(index, { ...formData });
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	function handleTrackDelete(trackIndex: number) {
		formData.top_tracks[trackIndex] = { id: '', name: '', display: '' };
		handleArtistComplete(index, formData);
	}

	$: isComplete = formData.artist_name && formData.email;

	function handleSearchClick() {
		debouncedSearch(searchTerm);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			debouncedSearch(searchTerm);
		}
	}
</script>

<div class="border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden">
	<!-- Header/Search Section -->
	<div class="p-4 border-b border-gray-200">
		<div class="flex flex-col gap-4">
			<div class="flex items-center justify-between">
				<span class="font-semibold text-gray-700">
					{formData.artist_name || `Performer ${index + 1}`}
				</span>
				{#if isComplete}
					<span class="text-green-500 text-sm">✓ Complete</span>
				{/if}
			</div>

			<!-- Search Form -->
			<div class="relative">
				<div class="flex gap-2">
					<div class="relative flex-1">
						<input
							type="text"
							placeholder="Search by artist name or email"
							bind:value={searchTerm}
							on:keydown={handleKeyDown}
							class="w-full px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500"
						/>
						{#if searchTerm}
							<button
								on:click={clearSearch}
								class="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full"
							>
								<svg class="w-4 h-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
									<path
										fill-rule="evenodd"
										d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
										clip-rule="evenodd"
									/>
								</svg>
							</button>
						{/if}
					</div>
					<button
						on:click={handleSearchClick}
						class="px-4 py-2 bg-blue-500 text-black rounded-lg hover:bg-blue-600 flex items-center gap-2 min-w-[100px] justify-center"
						disabled={isSearching}
					>
						{#if isSearching}
							<Loader class="w-4 h-4 animate-spin" />
						{:else}
							<Search class="w-4 h-4" />
						{/if}
						Search
					</button>
				</div>

				{#if searchError}
					<div class="mt-2 text-red-600 text-sm">{searchError}</div>
				{/if}

				{#if searchResults.length > 0}
					<div
						class="absolute z-[60] w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto"
					>
						{#each searchResults as artist}
							<button
								class="w-full text-left px-4 py-4 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none border-b last:border-b-0 transition-colors"
								on:click={() => selectArtist(artist)}
							>
								<div class="flex flex-col gap-2">
									<div class="flex justify-between items-start">
										<div>
											<p class="font-medium text-lg text-gray-900">{artist.artist_name}</p>
											<div class="flex gap-6 mt-1">
												<div class="flex items-center gap-1 text-sm text-gray-600">
													<svg
														class="w-4 h-4"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
														/>
													</svg>
													<span>{artist.email}</span>
												</div>
												{#if artist.primary_city}
													<div class="flex items-center gap-1 text-sm text-gray-600">
														<svg
															class="w-4 h-4"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
															/>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
															/>
														</svg>
														<span>{artist.primary_city}</span>
													</div>
												{/if}
											</div>
										</div>
										{#if artist.genres && artist.genres.length > 0}
											<div class="flex flex-wrap gap-1 max-w-[200px] justify-end">
												{#each artist.genres.slice(0, 2) as genre}
													<span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
														{genre}
													</span>
												{/each}
												{#if artist.genres.length > 2}
													<span class="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
														+{artist.genres.length - 2}
													</span>
												{/if}
											</div>
										{/if}
									</div>
									{#if artist.spotify_uri || artist.soundcloud_link || artist.instagram_link}
										<div class="flex gap-3">
											{#if artist.spotify_uri}
												<span class="text-xs px-2 py-1 bg-green-100 text-green-800 rounded"
													>Spotify</span
												>
											{/if}
											{#if artist.soundcloud_link}
												<span class="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded"
													>SoundCloud</span
												>
											{/if}
											{#if artist.instagram_link}
												<span class="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded"
													>Instagram</span
												>
											{/if}
										</div>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Extended Form Fields -->
	{#if expanded}
		<div transition:slide class="p-4 border-t border-gray-200 space-y-4">
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="artist_name_{index}">
						Artist Name *
					</label>
					<input
						id="artist_name_{index}"
						type="text"
						bind:value={formData.artist_name}
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
						required
					/>
				</div>
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="email_{index}">
						Email *
					</label>
					<input
						id="email_{index}"
						type="email"
						bind:value={formData.email}
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
						required
					/>
				</div>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="spotify_uri_{index}">
						Spotify URI
					</label>
					<input
						id="spotify_uri_{index}"
						type="text"
						bind:value={formData.spotify_uri}
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
					/>
				</div>
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="soundcloud_{index}">
						SoundCloud Link
					</label>
					<input
						id="soundcloud_{index}"
						type="url"
						bind:value={formData.soundcloud_link}
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
					/>
				</div>
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="bandcamp_{index}">
						Bandcamp Link
					</label>
					<input
						id="bandcamp_{index}"
						type="url"
						bind:value={formData.bandcamp_link}
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
					/>
				</div>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="facebook_{index}">
						Facebook Link
					</label>
					<input
						id="facebook_{index}"
						type="url"
						bind:value={formData.facebook_link}
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
					/>
				</div>
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="instagram_{index}">
						Instagram Link
					</label>
					<input
						id="instagram_{index}"
						type="url"
						bind:value={formData.instagram_link}
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
					/>
				</div>
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="ra_{index}">
						RA Link
					</label>
					<input
						id="ra_{index}"
						type="url"
						bind:value={formData.ra_link}
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
					/>
				</div>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="website_{index}">
						Website
					</label>
					<input
						id="website_{index}"
						type="url"
						bind:value={formData.website}
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
					/>
				</div>
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="primary_city_{index}">
						Primary City
					</label>
					<input
						id="primary_city_{index}"
						type="text"
						bind:value={formData.primary_city}
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
					/>
				</div>
			</div>

			<div>
				<!-- svelte-ignore a11y-label-has-associated-control -->
				<div class="block text-gray-700 text-sm font-bold mb-2">Performer Genres</div>
				<GenreSelector bind:selectedGenres={formData.genres} />
			</div>

				<div>
					<div class="block text-gray-700 text-sm font-bold mb-2">
						Top Tracks the performer loves to play
					</div>
					<TrackSearch selectedTracks={formData.top_tracks} onTracksChange={handleTracksChange} />
				</div>
		</div>
	{/if}
</div>
