<script lang="ts">
	import { onMount } from 'svelte';
	import type { spPlaylist, spTrack, spActivity } from '$lib/$types';

	export let data: {
		topTracks: (spTrack & { playCount: number })[];
		topArtists: {
			username: string;
			avatar_url: string | null;
			playCount: number;
			artistId: number;
		}[];
		topPlaylists: spPlaylist[];
		recentTracks: spActivity[];
		debug: {
			likedTracksCount: number;
			recentTracksCount: number;
			playlistsCount: number;
		};
	};

	let view: 'playlists' | 'artists' | 'tracks' = 'playlists';
	const setView = (newView: typeof view) => {
		view = newView;
	};
	let isLoading = false;
	let error: string | null = null;

	const getHighResImage = (url: string | null): string => {
		if (!url) return '/images/static_ella.jpg';
		if (url.includes('t500x500')) return url;
		return url.replace('large', 't500x500');
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
			.map((a) => ({ id: a.artistId, type: 'artist' as const }))
	};

	$: selectedItemsArray = [
		...selectedItems.tracks,
		...selectedItems.playlists,
		...selectedItems.artists
	];

	$: selectedCount = selectedItemsArray.length;

	const onSelect = async (id: number, type: 'track' | 'playlist' | 'artist') => {
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
						artist.artistId === id ? { ...artist, selected: !artist.selected } : artist
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
							return data.topArtists.find((a) => a.artistId === item.id);
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

			return await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
			throw err;
		} finally {
			isLoading = false;
		}
	};

	onMount(() => {
		// Any initialization code can go here
	});
</script>

<div class="min-h-screen relative">
	<div class="container mx-auto p-4 mb-24">
		{#if error}
			<div
				class="error-banner bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4"
			>
				{error}
			</div>
		{/if}

		<div class="toggle-buttons flex gap-2 lg:hidden mb-4">
			{#each ['playlists', 'artists', 'tracks'] as viewOption}
				<button
					on:click={() => setView(viewOption)}
					class="px-4 py-2 rounded {view === viewOption
						? 'bg-orange-500 text-white'
						: 'bg-gray-200'}"
				>
					{viewOption.charAt(0).toUpperCase() + viewOption.slice(1)}
				</button>
			{/each}
		</div>

		<div class="grid lg:grid-cols-3 gap-6">
			<!-- Playlists Section -->
			<section class="playlists-section {view !== 'playlists' ? 'hidden lg:block' : ''}">
				<h2 class="text-2xl font-bold mb-4">Playlists</h2>
				<div class="grid gap-4">
					{#each data.topPlaylists as playlist}
						<div
							class="item relative rounded-lg overflow-hidden cursor-pointer transition-transform hover:scale-105
                    {playlist.selected ? 'ring-4 ring-green-500' : ''}"
							on:click={() => onSelect(playlist.id, 'playlist')}
							on:keydown={(e) => e.key === 'Enter' && onSelect(playlist.id, 'playlist')}
							role="button"
							tabindex="0"
						>
							<img
								src={getHighResImage(playlist.artwork_url)}
								alt={playlist.title}
								class="w-full aspect-square object-cover"
							/>
							<div class="p-4 bg-bgdark">
								<h3 class="font-semibold truncate text-white">{playlist.title}</h3>
								{#if playlist.user}
									<p class="text-sm opacity-75 truncate text-white">
										{playlist.user.username}
									</p>
								{/if}

								<a
									href={playlist.permalink_url}
									class="text-orange-500 hover:text-orange-400 inline-block mt-2"
									target="_blank"
									rel="noopener noreferrer"
								>
									Listen on SoundCloud
								</a>

								<div class="mt-2 space-y-1">
									{#if playlist.tags}
										<p class="text-xs opacity-75 truncate text-white">
											Tags: {Array.isArray(playlist.tags)
												? playlist.tags.join(', ')
												: playlist.tags}
										</p>
									{/if}
									{#if playlist.genre}
										<p class="text-xs opacity-75 truncate text-white">
											Genre: {playlist.genre}
										</p>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- Artists Section -->
			<section class="artists-section {view !== 'artists' ? 'hidden lg:block' : ''}">
				<h2 class="text-2xl font-bold mb-4">Top Artists</h2>
				<div class="grid gap-4">
					{#each data.topArtists as artist}
						<div
							class="item relative rounded-lg overflow-hidden cursor-pointer transition-transform hover:scale-105
                    {artist.selected ? 'ring-4 ring-green-500' : ''}"
							on:click={() => onSelect(artist.artistId, 'artist')}
							on:keydown={(e) => e.key === 'Enter' && onSelect(artist.artistId, 'artist')}
							role="button"
							tabindex="0"
						>
							<img
								src={getHighResImage(artist.avatar_url)}
								alt={artist.username}
								class="w-full aspect-square object-cover"
							/>
							<div class="p-4 bg-bgdark">
								<h3 class="font-semibold truncate text-white">{artist.username}</h3>
								<p class="text-sm opacity-75 truncate text-white">
									{artist.playCount} plays
								</p>

								<a
									href={`https://soundcloud.com/${artist.username}`}
									class="text-orange-500 hover:text-orange-400 inline-block mt-2"
									target="_blank"
									rel="noopener noreferrer"
								>
									Listen on SoundCloud
								</a>

								<div class="mt-2 space-y-1">
									{#if artist.tags && artist.tags.length > 0}
										<p class="text-xs opacity-75 truncate text-white">
											Tags: {artist.tags.join(', ')}
										</p>
									{/if}
									{#if Array.isArray(artist.genre) && artist.genre.length > 0}
										<p class="text-xs opacity-75 truncate text-white">
											Genres: {artist.genre.join(', ')}
										</p>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- Tracks Section -->
			<section class="tracks-section {view !== 'tracks' ? 'hidden lg:block' : ''}">
				<h2 class="text-2xl font-bold mb-4">Recently Played Tracks</h2>
				<div class="grid gap-4">
					{#each data.recentTracks as activity}
						{#if activity.origin}
							<div
								class="item relative rounded-lg overflow-hidden cursor-pointer transition-transform hover:scale-105
                        {activity.origin.selected ? 'ring-4 ring-green-500' : ''}"
								on:click={() => onSelect(activity.origin.id, 'track')}
								on:keydown={(e) => e.key === 'Enter' && onSelect(activity.origin.id, 'track')}
								role="button"
								tabindex="0"
							>
								<img
									src={getHighResImage(activity.origin.artwork_url)}
									alt={activity.origin.title}
									class="w-full aspect-square object-cover"
								/>
								<div class="p-4 bg-bgdark">
									<h3 class="font-semibold truncate text-white">{activity.origin.title}</h3>
									{#if activity.origin.user}
										<p class="text-sm opacity-75 truncate text-white">
											{activity.origin.user.username}
										</p>
									{/if}

									<a
										href={activity.origin.permalink_url}
										class="text-orange-500 hover:text-orange-400 inline-block mt-2"
										target="_blank"
										rel="noopener noreferrer"
									>
										Listen on SoundCloud
									</a>

									<div class="mt-2 space-y-1">
										{#if activity.origin.tags}
											<p class="text-xs opacity-75 truncate text-white">
												Tags: {Array.isArray(activity.origin.tags)
													? activity.origin.tags.join(', ')
													: activity.origin.tags}
											</p>
										{/if}
										{#if activity.origin.genre}
											<p class="text-xs opacity-75 truncate text-white">
												Genres: {Array.isArray(activity.origin.genre)
													? activity.origin.genre.join(', ')
													: activity.origin.genre}
											</p>
										{/if}
									</div>
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</section>
		</div>
	</div>

	<!-- Selection Summary -->
	{#if selectedCount > 0}
		<div class="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-50">
			<div class="container mx-auto flex justify-between items-center">
				<p class="font-semibold">
					{selectedCount} item{selectedCount === 1 ? '' : 's'} selected
				</p>
				<button
					on:click={handleSubmitSelection}
					disabled={isLoading}
					class="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
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

	@screen lg {
		.container {
			@apply grid-cols-3 gap-8;
		}

		.section {
			@apply block;
		}
	}

	.item:focus-visible {
		@apply outline-none ring-2 ring-orange-500 ring-offset-2;
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
