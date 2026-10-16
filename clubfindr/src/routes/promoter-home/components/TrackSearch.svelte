<script lang="ts">
	import { Search, Loader, Music, X } from 'lucide-svelte';
	import type { PerformerTrack } from '$lib/$types';
	import pkg from 'lodash';
	const { debounce } = pkg;

	const MAX_TRACKS = 5;
	interface Props {
		selectedTracks?: PerformerTrack[];
		onTracksChange: (tracks: PerformerTrack[]) => void;
	}

	let { selectedTracks = $bindable([]), onTracksChange }: Props = $props();

	interface SpotifyArtist {
		name: string;
	}

	interface SpotifyAlbum {
		name: string;
	}

	interface SpotifyTrack {
		id: string;
		name: string;
		artists: SpotifyArtist[];
		album: SpotifyAlbum;
		duration_ms: number;
		preview_url: string | null;
	}

	interface SearchResult {
		id: string;
		name: string;
		artists: string[];
		album: string;
		duration: number;
		preview_url: string | null;
	}

	let searchTerm = $state('');
	let isSearching = $state(false);
	let searchResults: SearchResult[] = $state([]);
	let searchError = $state('');
	let searchContainerElement: HTMLDivElement | undefined = $state();

	// Clean up invalid tracks
	$effect.pre(() => {
		const cleanTracks = selectedTracks.filter(
			(track) => track && track.id && track.name && track.artists && track.display
		);
		if (cleanTracks.length !== selectedTracks.length) {
			selectedTracks = cleanTracks;
			onTracksChange(cleanTracks);
		}
	});

	const debouncedSearch = debounce(async (term: string) => {
		if (!term.trim()) {
			searchResults = [];
			return;
		}

		isSearching = true;
		searchError = '';

		try {
			const response = await fetch(`/api/spotify/search?q=${encodeURIComponent(term)}&type=track`);
			if (!response.ok) throw new Error('Search failed');

			const data = await response.json();
			searchResults = data.tracks.items.map((track: SpotifyTrack) => ({
				id: track.id,
				name: track.name,
				artists: track.artists.map((artist: SpotifyArtist) => artist.name),
				album: track.album.name,
				duration: track.duration_ms,
				preview_url: track.preview_url
			}));
		} catch (error) {
			console.error('Search error:', error);
			searchError = 'Failed to search tracks. Please try again.';
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}, 300);

	function selectTrack(track: SearchResult) {
		if (selectedTracks.length < MAX_TRACKS) {
			const newTrack = {
				id: track.id,
				name: track.name,
				artists: track.artists,
				display: `${track.name} - ${track.artists.join(', ')}`
			};
			selectedTracks = [...selectedTracks, newTrack];
			onTracksChange(selectedTracks);
			searchTerm = '';
			searchResults = [];
		}
	}

	function removeTrack(indexToRemove: number) {
		selectedTracks = selectedTracks.filter((_, index) => index !== indexToRemove);
		onTracksChange(selectedTracks);
	}

	function clearSearch() {
		searchTerm = '';
		searchResults = [];
	}

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

<!-- Added min-height and padding-bottom to accommodate dropdown -->
<div class="relative" bind:this={searchContainerElement}>
	<!-- Search container with margin-bottom when results are shown -->
	<div class="relative {searchResults.length > 0 ? 'mb-[500px]' : ''}">
		<!-- Search Bar -->
		<div class="flex gap-2">
			<div class="relative flex-1">
				<input
					type="text"
					placeholder="Search for tracks to add..."
					bind:value={searchTerm}
					onkeydown={handleKeyDown}
					class="w-full px-4 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500"
					disabled={selectedTracks.length >= MAX_TRACKS}
				/>
				{#if searchTerm}
					<button
						onclick={clearSearch}
						class="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full"
					>
						<X class="w-4 h-4 text-gray-500" />
					</button>
				{/if}
			</div>
			<button
				onclick={handleSearchClick}
				class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 min-w-[100px] justify-center disabled:opacity-50 disabled:cursor-not-allowed"
				disabled={isSearching || selectedTracks.length >= MAX_TRACKS}
			>
				{#if isSearching}
					<Loader class="w-4 h-4 animate-spin" />
				{:else}
					<Search class="w-4 h-4" />
				{/if}
				Search
			</button>
		</div>

		<!-- Selected Tracks Count -->
		<div class="text-sm text-gray-600 mt-2">
			{selectedTracks.length} of {MAX_TRACKS} tracks selected
		</div>

		<!-- Search Results with fixed positioning -->
		{#if searchResults.length > 0}
			<div
				class="absolute left-0 right-0 border rounded-lg divide-y bg-white shadow-lg mt-2 max-h-[400px] overflow-y-auto"
			>
				{#each searchResults as track (track.id)}
					<div class="p-4 hover:bg-gray-50 flex justify-between items-center gap-4">
						<div class="flex-1 min-w-0">
							<div class="font-medium text-gray-900 truncate">{track.name}</div>
							<div class="text-sm text-gray-600">{track.artists.join(', ')}</div>
							<div class="text-xs text-gray-500 mt-1">{track.album}</div>
						</div>
						<div class="flex items-center gap-4 shrink-0">
							{#if track.preview_url}
								<audio src={track.preview_url} controls class="h-8 w-32">
									<track kind="captions" />
								</audio>
							{/if}
							<button
								class="px-4 py-2 bg-green-500 text-black rounded-sm hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
								onclick={() => selectTrack(track)}
								disabled={selectedTracks.length >= MAX_TRACKS}
							>
								Add Track
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Selected Tracks -->
	<div class="mt-4">
		{#if selectedTracks.length > 0}
			<div class="space-y-2">
				<div class="text-sm font-medium text-gray-700">Selected Tracks</div>
				{#each selectedTracks as track, i (i)}
					<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg gap-2">
						<div class="flex items-center gap-2 min-w-0">
							<Music class="w-4 h-4 shrink-0 text-gray-600" />
							<span class="text-sm text-gray-700 truncate">{track.display}</span>
						</div>
						<button
							onclick={() => removeTrack(i)}
							class="p-1.5 hover:bg-gray-200 rounded-full text-gray-500 hover:text-gray-700 shrink-0"
							title="Remove track"
						>
							<X class="w-4 h-4" />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#if searchError}
		<div class="text-red-600 text-sm mt-2">{searchError}</div>
	{/if}
</div>
