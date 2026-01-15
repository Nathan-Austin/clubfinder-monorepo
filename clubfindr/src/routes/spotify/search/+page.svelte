<!-- routes/spotify/search/+page.svelte -->

<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Artist_search, Track } from '$lib/$types';

	export let data: { props: { artists: Artist_search[]; tracks: Track[] } };

	// Default view mode is 'artists'
	let viewMode: 'artists' | 'tracks' = 'artists';
	let message = data.message;
	let newSearchQuery = '';

	function handleNewSearch() {
		// Set the new search query in cookies and reload the page
		document.cookie = `search=${encodeURIComponent(newSearchQuery)}; path=/; max-age=3600`;
		location.reload();
	}

	// Mapping track and artist data for display
	let tracks =
		data.props.tracks?.map(({ album, artists, id, name, spotifyLink }) => ({
			name,
			id,
			image: album?.images?.[0]?.url, // Taking the first available image
			artist: artists?.[0] || {}, // Fallback to empty object if artist is not available
			selected: false,
			spotifyLink
		})) || [];

	let artists =
		data.props.artists?.map(({ id, name, images, genres, spotifyLink }) => ({
			id,
			name,
			image: images?.[0]?.url, // Taking the first available image
			selected: false,
			genres,
			spotifyLink
		})) || [];

	// Count of selected items
	$: selectedCount =
		tracks.filter((t) => t.selected).length + artists.filter((a) => a.selected).length;

	// Get the selected artist and track IDs
	$: selectedIds = [
		...tracks
			.filter((t) => t.selected && t.artist?.id) // Ensure there's an artist and the artist has an ID
			.map((t) => t.artist?.id as string), // Explicitly cast to string
		...artists
			.filter((a) => a.selected && a.id) // Ensure there's an artist with an ID
			.map((a) => a.id as string) // Explicitly cast to string
	].filter(Boolean); // Filter out any null or undefined values

	// Toggle between artists and tracks
	function toggleView(mode: 'artists' | 'tracks') {
		viewMode = mode;
	}

	// Selection handler
	const onSelect = (id: string, type: 'track' | 'artist') => {
		let item;
		switch (type) {
			case 'track':
				item = tracks.find((t) => t.id === id);
				if (item) {
					item.selected = !item.selected;
					tracks = [...tracks]; // Trigger reactivity
					console.log(
						`Track selected: ${item.name} (ID: ${item.id})`,
						`Selected: ${item.selected}`
					);
				}
				break;
			case 'artist':
				item = artists.find((a) => a.id === id);
				if (item) {
					item.selected = !item.selected;
					artists = [...artists]; // Trigger reactivity
					console.log(
						`Artist selected: ${item.name} (ID: ${item.id})`,
						`Selected: ${item.selected}`
					);
				}
				break;
		}
	};
	$: tracks = [...tracks]; // Force Svelte to recognize changes
	$: artists = [...artists]; // Force Svelte to recognize changes

	// Handle form submission
	async function proceedToClubsPage() {
		if (selectedIds.length === 0) return;

		try {
			// Ensure selectedIds is a flat array of strings
			const processedIds = selectedIds.filter((id) => typeof id === 'string');

			console.log('Sending request with IDs:', processedIds);

			// Use relative path for the API endpoint
			const response = await fetch('../api/spotify/artists', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({ selectedIds: processedIds })
			});

			console.log('Response status:', response.status);
			console.log('Request URL:', response.url); // Added for debugging

			if (!response.ok) {
				const responseText = await response.text();
				console.error('Error response:', responseText);
				message = 'Error processing request. Check console for details.';
				return;
			}

			const jsonResponse = await response.json();
			console.log('Successfully processed response:', jsonResponse);

			// If successful, navigate to the next page (clubs)
			await goto('/clubs');
		} catch (error) {
			console.error('Error in form submission:', error);
			if (error instanceof Error) {
				message = `Error: ${error.message}. Please try again.`;
			} else {
				message = 'An unexpected error occurred. Please try again.';
			}
		}
	}

	async function proceedToBarfindrpage() {
		if (selectedIds.length === 0) return;

		try {
			// Ensure selectedIds is a flat array of strings
			const processedIds = selectedIds.filter((id) => typeof id === 'string');

			console.log('Sending request with IDs:', processedIds);

			// Use relative path for the API endpoint
			const response = await fetch('../api/spotify/artists', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({ selectedIds: processedIds })
			});

			console.log('Response status:', response.status);
			console.log('Request URL:', response.url); // Added for debugging

			if (!response.ok) {
				const responseText = await response.text();
				console.error('Error response:', responseText);
				message = 'Error processing request. Check console for details.';
				return;
			}

			const jsonResponse = await response.json();
			console.log('Successfully processed response:', jsonResponse);

			// If successful, navigate to the next page (clubs)
			await goto('/barfindr');
		} catch (error) {
			console.error('Error in form submission:', error);
			if (error instanceof Error) {
				message = `Error: ${error.message}. Please try again.`;
			} else {
				message = 'An unexpected error occurred. Please try again.';
			}
		}
	}
	// Calculate and apply border-radius based on the image height
	function applyBorderRadius(imageElement: HTMLImageElement) {
		const height = imageElement.naturalHeight; // Get the original height of the image
		let radius = Math.round(height * 0.025); // 2.5% of height, rounded to nearest whole number
		if (radius < 4) radius = 4; // Ensure minimum of 4
		imageElement.style.borderRadius = `${radius}px`; // Apply the calculated radius
	}

	// Apply border-radius to all images once they load
	function onImageLoad(event: Event) {
		const imageElement = event.target as HTMLImageElement;
		applyBorderRadius(imageElement);
	}
</script>

<div class="wrapper">
	<a href="https://www.spotify.com" target="_blank">
		<img
			src="/lib/2024-spotify-full-logo/Full_Logo_White_CMYK.svg"
			alt="Spotify Logo"
			class="spotify-logo mr-4"
		/>
	</a>

	<!-- View Toggle Buttons -->
	<div class="view-toggle">
		<button on:click={() => toggleView('artists')} class={viewMode === 'artists' ? 'active' : ''}>
			View Artists
		</button>
		<button on:click={() => toggleView('tracks')} class={viewMode === 'tracks' ? 'active' : ''}>
			View Tracks
		</button>
	</div>
	{#if message}
		<div class="message">{message}</div>
		<form on:submit|preventDefault={handleNewSearch}>
			<input type="text" bind:value={newSearchQuery} placeholder="Enter new search query" />
			<button type="submit">Search</button>
		</form>
	{/if}

	<span class="text-sm mb-4">{selectedCount} selected</span>

	<!-- Conditionally render Artists or Tracks based on viewMode -->
	{#if viewMode === 'artists'}
		<div class="section artists">
			<h2 class="section-title">Top Artists</h2>
			<div class="items-grid">
				{#each artists as artist (artist.id)}
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<div
						class="item {artist.selected ? 'selected' : ''}"
						on:click={() => onSelect(artist.id, 'artist')}
					>
						<img src={artist.image} alt={artist.name} on:load={onImageLoad} />
						<div class="overlay">
							<span>{artist.name}</span><br />
							<a href={artist.spotifyLink} style="color: #1db954;" target="_blank"
								>Listen on Spotify</a
							>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="section tracks">
			<h2 class="section-title">Top Tracks</h2>
			<div class="items-grid">
				{#each tracks as track (track.id)}
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<div
						class="item {track.selected ? 'selected' : ''}"
						on:click={() => onSelect(track.id, 'track')}
					>
						<img src={track.image} alt={track.name} on:load={onImageLoad} />
						<div class="overlay">
							<span>{track.name} by {track.artist.name}</span><br />
							<a href={track.spotifyLink} style="color: #1db954;" target="_blank"
								>Listen on Spotify</a
							>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Button to proceed to clubs page -->
	<div class="text-center">
		<button class="floating-search-clubs-button" on:click={proceedToClubsPage}>
			Search for Clubs
		</button>
	</div>
	<!-- Button to proceed to barfindr page -->
	<div class="text-center">
		<button class="floating-search-bars-button" on:click={proceedToBarfindrpage}>
			Search for Bars
		</button>
	</div>
</div>

<style lang="postcss">
	/* Wrapper and Content */
	.wrapper {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		padding: 1rem;
		box-sizing: border-box;
	}

	.spotify-logo {
		width: 150px; /* Adjust size as needed */
		margin-right: 1rem; /* Space between logo and text */
	}

	/* View Toggle Buttons */
	.view-toggle {
		margin-bottom: 20px;
		display: flex;
		justify-content: center;
	}

	.view-toggle button {
		margin-right: 10px;
		padding: 10px;
		cursor: pointer;
		border: none;
		background-color: transparent;
		color: #fff;
		font-size: 1rem;
		transition: background-color 0.2s;
	}

	.view-toggle button.active {
		background-color: #1db954;
		color: #fff;
	}

	.view-toggle button:hover {
		background-color: rgba(29, 185, 84, 0.2);
	}

	/* Section Styling */
	.section {
		margin-bottom: 2rem;
	}

	.section-title {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	/* Items Grid */
	.items-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(200px, 1fr));
		gap: 1rem;
		justify-items: center;
		align-items: start;
	}

	/* Item Styling */
	.item {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		text-align: center;
		cursor: pointer;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		transition: transform 0.2s;
		padding: 10px;
		box-sizing: border-box;
	}

	.item:hover {
		transform: scale(1.05);
	}

	.item img {
		width: 100%;
		aspect-ratio: 1 / 1;
		object-fit: fill;
		border-radius: 0;
	}
	.item.selected {
		border: 10px solid #1db954;
		background-color: rgba(29, 185, 84, 0.1); /* Light green background */
	}

	/* Selected State */
	.item.selected::after {
		position: absolute;
		top: 10px;
		right: 10px;
		font-size: 1.5rem;
		color: #1db954; /* Spotify green for selected state */
	}

	/* Overlay */
	.overlay {
		background-color: rgba(0, 0, 0, 0.7);
		color: white;
		padding: 10px;
		text-align: center;
		display: block;
		width: 100%;
		height: 50px;
		margin-top: auto;
		overflow: hidden;
		transition: height 0.3s ease, overflow 0.3s ease;
	}

	.item:hover .overlay {
		height: 120px;
		overflow: auto;
	}

	.overlay span {
		display: block;
		justify-content: space-between;
		align-items: center;
	}

	/* Floating Button */
	.floating-search-clubs-button {
		position: fixed;
		left: 20px;
		bottom: 20px;
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		background-color: #ffd700;
		color: black;
		border: none;
		border-radius: 50px;
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
		cursor: pointer;
		z-index: 1000;
		transition: background-color 0.3s ease, transform 0.2s ease;
	}

	.floating-search-clubs-button:hover {
		background-color: #ffc107;
		transform: scale(1.1);
	}
	.floating-search-bars-button {
		position: fixed;
		left: 200px;
		bottom: 20px;
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		background-color: #ffd700;
		color: black;
		border: none;
		border-radius: 50px;
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
		cursor: pointer;
		z-index: 1000;
		transition: background-color 0.3s ease, transform 0.2s ease;
	}

	.floating-search-bars-button:hover {
		background-color: #ffc107;
		transform: scale(1.1);
	}
	/* Message Styling */
	.message {
		background-color: #ff4444;
		color: white;
		padding: 1rem;
		margin: 1rem 0;
		border-radius: 8px;
		text-align: center;
		font-weight: 500;
	}

	/* Responsive Styles */
	@media (max-width: 768px) {
		/* Adjust grid columns for mobile */
		.items-grid {
			grid-template-columns: repeat(1, 1fr);
		}
	}
</style>
