<script lang="ts">
	import { onMount } from 'svelte';

	export let data: {
		topTracks: any[];
		topArtists: any[];
		topPlaylists: any[];
		debug: any;
	};

	let view: 'playlists' | 'artists' | 'tracks' = 'artists';
	const viewOptions = ['playlists', 'artists', 'tracks'] as const;
	const setView = (newView: typeof view) => {
		view = newView;
	};
	let isLoading = false;
	let error: string | null = null;

	const getHighResImage = (url: string | null): string => {
		return url || '/images/static_ella.jpg';
	};

	$: selectedItems = {
		tracks: data.topTracks
			.filter((t) => t.selected)
			.map((t) => ({ id: t.id, type: 'track' as const })),
		playlists: data.topPlaylists
			.filter((p) => p.selected)
			.map((p) => ({ id: p.id, type: 'playlist' as const })),
		artists: data.topArtists
			.filter((a) => a.selected)
			.map((a) => ({ id: a.id, type: 'artist' as const }))
	};

	$: selectedItemsArray = [
		...selectedItems.tracks,
		...selectedItems.playlists,
		...selectedItems.artists
	];

	$: selectedCount = selectedItemsArray.length;

	const onSelect = async (id: string, type: 'track' | 'playlist' | 'artist') => {
		try {
			switch (type) {
				case 'track':
					data.topTracks = data.topTracks.map((track) =>
						track.id === id ? { ...track, selected: !track.selected } : track
					);
					break;
				case 'playlist':
					data.topPlaylists = data.topPlaylists.map((playlist) =>
						playlist.id === id ? { ...playlist, selected: !playlist.selected } : playlist
					);
					break;
				case 'artist':
					data.topArtists = data.topArtists.map((artist) =>
						artist.id === id ? { ...artist, selected: !artist.selected } : artist
					);
					break;
			}
		} catch (err) {
			console.error('Error in selection:', err);
			error = 'Failed to update selection';
		}
	};

	const handleSubmitSelection = async () => {
		isLoading = true;
		error = null;

		try {
			const selectedData = selectedItemsArray.map((item) => ({
				id: item.id,
				type: item.type,
				data: (() => {
					switch (item.type) {
						case 'track':
							return data.topTracks.find((t) => t.id === item.id);
						case 'playlist':
							return data.topPlaylists.find((p) => p.id === item.id);
						case 'artist':
							return data.topArtists.find((a) => a.id === item.id);
					}
				})()
			}));

			const response = await fetch('/api/analyze-selections', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(selectedData)
			});

			if (!response.ok) {
				throw new Error('Failed to analyze selections');
			}

			const result = await response.json();
			if (result.success) {
				window.location.href = '/clubs';
			}
			return result;
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
			throw err;
		} finally {
			isLoading = false;
		}
	};
</script>

<div class="min-h-screen relative">

	<div class="container mx-auto p-4 mb-24">

		<h1 class="text-3xl font-bold mb-6 text-center text-light">Your Tidal Music</h1>

		

		{#if error}

			<div class="error-banner bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">

				{error}

			</div>

		{/if}



		<div class="toggle-buttons flex gap-2 lg:hidden mb-4">

			{#each viewOptions as viewOption}

				<button

					on:click={() => setView(viewOption)}

					class="px-4 py-2 rounded {view === viewOption ? 'bg-secondary text-white' : 'bg-gray-200 text-black'}"

				>

					{viewOption.charAt(0).toUpperCase() + viewOption.slice(1)}

				</button>

			{/each}

		</div>



		<div class="grid lg:grid-cols-3 gap-6">

			<!-- Artists Section -->

			<section class="artists-section {view !== 'artists' ? 'hidden lg:block' : ''}">

				<h2 class="text-2xl font-bold mb-4">Favorite Artists</h2>

				<div class="grid gap-4">

					{#each data.topArtists as artist}

						<div

							class="item relative rounded-lg overflow-hidden cursor-pointer transition-transform hover:scale-105 {artist.selected ? 'ring-4 ring-green-500' : ''}"

							on:click={() => onSelect(artist.id, 'artist')}

							on:keydown={(e) => e.key === 'Enter' && onSelect(artist.id, 'artist')}

							role="button"

							tabindex="0"

						>

							<img src={getHighResImage(artist.avatar_url)} alt={artist.username} class="w-full aspect-square object-cover" />

							<div class="p-4 bg-bgdark">

								<h3 class="font-semibold truncate text-white">{artist.username}</h3>

								{#if artist.genre && artist.genre.length > 0}

									<p class="text-xs opacity-75 truncate text-white">

										Genres: {Array.isArray(artist.genre) ? artist.genre.join(', ') : artist.genre}

									</p>

								{/if}

							</div>

						</div>

					{/each}

				</div>

			</section>



			<!-- Tracks Section -->

			<section class="tracks-section {view !== 'tracks' ? 'hidden lg:block' : ''}">

				<h2 class="text-2xl font-bold mb-4">Favorite Tracks</h2>

				<div class="grid gap-4">

					{#each data.topTracks as track}

						<div

							class="item relative rounded-lg overflow-hidden cursor-pointer transition-transform hover:scale-105 {track.selected ? 'ring-4 ring-green-500' : ''}"

							on:click={() => onSelect(track.id, 'track')}

							on:keydown={(e) => e.key === 'Enter' && onSelect(track.id, 'track')}

							role="button"

							tabindex="0"

						>

							<img src={getHighResImage(track.artwork_url)} alt={track.title} class="w-full aspect-square object-cover" />

							<div class="p-4 bg-bgdark">

								<h3 class="font-semibold truncate text-white">{track.title}</h3>

								<p class="text-sm opacity-75 truncate text-white">{track.user.username}</p>

							</div>

						</div>

					{/each}

				</div>

			</section>



			<!-- Playlists Section -->

			<section class="playlists-section {view !== 'playlists' ? 'hidden lg:block' : ''}">

				<h2 class="text-2xl font-bold mb-4">Favorite Playlists</h2>

				<div class="grid gap-4">

					{#each data.topPlaylists as playlist}

						<div

							class="item relative rounded-lg overflow-hidden cursor-pointer transition-transform hover:scale-105 {playlist.selected ? 'ring-4 ring-green-500' : ''}"

							on:click={() => onSelect(playlist.id, 'playlist')}

							on:keydown={(e) => e.key === 'Enter' && onSelect(playlist.id, 'playlist')}

							role="button"

							tabindex="0"

						>

							<img src={getHighResImage(playlist.artwork_url)} alt={playlist.title} class="w-full aspect-square object-cover" />

							<div class="p-4 bg-bgdark">

								<h3 class="font-semibold truncate text-white">{playlist.title}</h3>

							</div>

						</div>

					{/each}

				</div>

			</section>

		</div>

	</div>



	{#if selectedCount > 0}

		<div class="fixed bottom-0 left-0 right-0 bg-bgdark border-t border-secondary shadow-lg p-4 z-50">

			<div class="container mx-auto flex justify-between items-center">

				<p class="font-semibold text-white">

					{selectedCount} item{selectedCount === 1 ? '' : 's'} selected

				</p>

				<button

					on:click={handleSubmitSelection}

					disabled={isLoading}

					class="px-6 py-2 bg-secondary text-white rounded-lg hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"

				>

					{isLoading ? 'Analyzing...' : 'Find Bars or Clubs'}

				</button>

			</div>

		</div>

	{/if}

</div>



<style lang="postcss">

	.item {

		@apply relative overflow-hidden shadow-md;

	}

	.item:focus-visible {

		@apply outline-none ring-2 ring-secondary ring-offset-2;

	}

	.error-banner {

		@apply animate-fade-in duration-300;

	}

	@keyframes fade-in {

		from {

			opacity: 0;

			transform: translateY(-1rem);

		}

		to {

			opacity: 1;

			transform: translateY(0);

		}

	}

</style>


