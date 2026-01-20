<!-- routes/spotify/+page.svelte -->

<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { Artist, PlaylistWithArtists, RecentlyPlayedTrack } from '$lib/$types';
	export let data: PageData;

	import ConfirmPopup from '../ConfirmPopup.svelte';
	let showConfirmationPopup = false;
	let profileComplete = data.profileComplete;
	let showForm = !profileComplete;
	export let email = '';
	let password = '';
	let confirmPassword = '';
	let errorMessage = '';

	function toggleForm() {
		showForm = !showForm;
	}

	// State to manage mobile view selection
	let selectedView: 'playlists' | 'artists' | 'tracks' = 'playlists';

	type RecentlyPlayedTrackWithLink = RecentlyPlayedTrack & { spotifyLink?: string };
	type TrackItem = {
		id: string;
		name: string;
		image?: string;
		artist?: { id: string; name: string };
		selected: boolean;
		spotifyUrl?: string;
	};
	type PlaylistItem = {
		id: string;
		name: string;
		image?: string;
		selected: boolean;
		artists: string[];
		description?: string;
		followers?: number;
		spotifyUrl?: string;
	};
	type ArtistItem = {
		id: string;
		name: string;
		image?: string;
		selected: boolean;
		genres?: string[];
		spotifyUrl?: string;
	};

	// Initialize data arrays
	const recentTracks = (data.recentlyPlayedTracks ?? []) as RecentlyPlayedTrackWithLink[];
	let tracks: TrackItem[] = recentTracks.map((track) => ({
		name: track.name,
		id: track.id,
		image:
			track.album?.images?.find((image) => image.width === 300)?.url ||
			track.album?.images?.[0]?.url,
		artist: track.artists?.[0] ? track.artists[0] : undefined,
		selected: false,
		spotifyUrl: track.spotifyLink
	}));

	const playlistData = (data.playlists ?? []) as PlaylistWithArtists[];
	let playlists: PlaylistItem[] = playlistData.map((playlist) => ({
		id: playlist.id,
		name: playlist.name,
		image: playlist.images?.find((image) => image.width === 300)?.url || playlist.images?.[0]?.url,
		selected: false,
		artists: playlist.artistIds,
		description: playlist.description,
		followers: playlist.followers,
		spotifyUrl: playlist.external_urls?.spotify
	}));

	const artistData = (data.topArtists ?? []) as Artist[];
	let artists: ArtistItem[] = artistData.map((artist) => ({
		id: artist.id,
		name: artist.name,
		image: artist.images?.find((image) => image.width === 300)?.url || artist.images?.[0]?.url,
		selected: false,
		genres: artist.genres,
		spotifyUrl: artist.external_urls?.spotify
	}));

	// Compute selected count and IDs
	$: selectedCount =
		tracks.filter((t) => t.selected).length +
		playlists.filter((p) => p.selected).length +
		artists.filter((a) => a.selected).length;

	$: selectedIds = [
		...tracks
			.filter((t) => t.selected)
			.map((t) => t.artist?.id)
			.filter(Boolean),
		...playlists
			.filter((p) => p.selected)
			.flatMap((p) => p.artists)
			.filter(Boolean),
		...artists
			.filter((a) => a.selected)
			.map((a) => a.id)
			.filter(Boolean)
	];

	// Selection handler
	const onSelect = (id: string, type: 'track' | 'playlist' | 'artist') => {
		let item;
		switch (type) {
			case 'track':
				item = tracks.find((t) => t.id === id);
				if (item) {
					item.selected = !item.selected;
					tracks = [...tracks]; // Force reactivity
				}
				break;
			case 'playlist':
				item = playlists.find((p) => p.id === id);
				if (item) {
					item.selected = !item.selected;
					playlists = [...playlists]; // Force reactivity
				}
				break;
			case 'artist':
				item = artists.find((a) => a.id === id);
				if (item) {
					item.selected = !item.selected;
					artists = [...artists]; // Force reactivity
				}
				break;
		}
	};
	async function submitForm() {
		if (password !== confirmPassword) {
			errorMessage = 'Passwords do not match';
			return;
		}
		try {
			const response = await fetch('/api/update-user', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ email, password })
			});

			if (response.ok) {
				localStorage.setItem('userEmail', email);
				// If successful, show the confirmation popup and hide the form
				showConfirmationPopup = true;
				showForm = false;
			} else {
				// If the response isn't OK, show the error message
				const error = await response.json();
				errorMessage = error.message || 'Failed to update profile';
			}
		} catch (err) {
			// Catch and display errors during the fetch request
			console.error('Error during profile update:', err);
			errorMessage = 'An error occurred while updating your profile.';
		}
	}
	// Function to close the popup
	function closePopup() {
		showConfirmationPopup = false; // Close the popup
	}

	// Submission handlers
	const onSubmit = async () => {
		if (selectedIds.length === 0) return;
		await fetch('/api/spotify/artists', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				selectedIds
			})
		});
		goto('/selectedGenres');
	};

	const onLetUsGo = async () => {
		if (selectedIds.length === 0) return;
		await fetch('/api/spotify/artists', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				selectedIds
			})
		});
		console.log('POST request sent with ids:', selectedIds);
		goto('/clubs');
	};
	const onLetsGoBars = async () => {
		if (selectedIds.length === 0) return;
		await fetch('/api/spotify/artists', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				selectedIds
			})
		});
		console.log('POST request sent with ids:', selectedIds);
		goto('/barfindr');
	};

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
	// Function to handle closing the popup via keyboard events
	function handleKeyDown(event: KeyboardEvent) {
		// Close the popup if "Enter" or "Escape" keys are pressed
		if (event.key === 'Enter' || event.key === 'Escape') {
			closePopup();
		}
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
	<div class="content">
		<h1 class="text-2xl mb-4 md:mb-8">Find bars or clubs with a vibe like&hellip;</h1>
		<!-- <span class="text-sm mb-4">{selectedCount} selected</span> -->
		<!-- Notification banner to prompt the user to update their profile -->
		<!-- Update Section - Only visible if the profile is incomplete -->
		{#if !profileComplete}
			<div class="update-section">
				<h2 class="section-header">Update Your Information</h2>
				<p class="description">
					Please update your details for a better experience on Clubfindr. This information helps us
					personalize your recommendations and communication and gives access to your user profile
					page.
				</p>

				<!-- Notification banner if profile is incomplete -->
				<div class="notification-banner">
					<p>Update your email and set a password to complete your profile.</p>
					<button class="btn btn-primary" on:click={toggleForm}>
						{#if showForm}Hide{/if}
						{#if !showForm}Update Now{/if}
					</button>
				</div>

				{#if showForm}
					<!-- Update Form -->
					<div class="form-card">
						<form on:submit|preventDefault={submitForm}>
							<div class="form-group">
								<label for="email">Email</label>
								<input
									type="email"
									id="email"
									class="input-field"
									bind:value={email}
									placeholder="Enter your email"
									required
								/>
							</div>
							<div class="form-group">
								<label for="password">Password</label>
								<input
									type="password"
									id="password"
									class="input-field"
									bind:value={password}
									placeholder="Enter a password"
									required
								/>
							</div>
							<div class="form-group">
								<label for="confirmPassword">Confirm Password</label>
								<input
									type="password"
									id="confirmPassword"
									class="input-field"
									bind:value={confirmPassword}
									placeholder="Confirm your password"
									required
								/>
							</div>
							<!-- Error Message -->
							{#if errorMessage}
								<p class="error-message">{errorMessage}</p>
							{/if}

							<!-- Submit Button -->
							<button type="submit" class="btn btn-submit">Save Changes</button>
						</form>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Confirmation Popup -->
		{#if showConfirmationPopup}
			<div
				class="popup-overlay"
				on:click|self={closePopup}
				on:keydown={handleKeyDown}
				role="button"
				tabindex="0"
				aria-label="Close popup"
			>
				<div class="popup">
					<ConfirmPopup on:close={closePopup} />
				</div>
			</div>
		{/if}

		<!-- Dropdown for mobile view -->
		<div class="mobile-dropdown md:hidden mb-4 text-black">
			<select bind:value={selectedView} class="dropdown-select">
				<option value="playlists">Playlists</option>
				<option value="artists">Top Artists</option>
				<option value="tracks">Recently Played Tracks</option>
			</select>
		</div>

		<!-- Grid container -->
		<div class="grid-container">
			<!-- Playlists Section -->
			<div class="section playlists" class:hide-on-mobile={selectedView !== 'playlists'}>
				<h2 class="section-title">Playlists</h2>
				<div class="items-grid">
					{#each playlists as playlist}
						<!-- The entire item box is clickable -->
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<div
							class="item {playlist.selected ? 'selected' : ''}"
							on:click={() => onSelect(playlist.id, 'playlist')}
						>
							<img src={playlist.image} alt={playlist.name} on:load={onImageLoad} />
							<div class="overlay">
								<span>{playlist.name}</span><br />
								<a href={playlist.spotifyUrl} style="color: #1db954;" target="_blank"
									>Listen on Spotify</a
								>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Artists Section -->
			<div class="section artists" class:hide-on-mobile={selectedView !== 'artists'}>
				<h2 class="section-title">Top Artists</h2>
				<div class="items-grid">
					{#each artists as artist}
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<div
							class="item {artist.selected ? 'selected' : ''}"
							on:click={() => onSelect(artist.id, 'artist')}
						>
							<img src={artist.image} alt={artist.name} on:load={onImageLoad} />
							<div class="overlay">
								<span>{artist.name}</span><br />
								<a href={artist.spotifyUrl} style="color: #1db954;" target="_blank"
									>Listen on Spotify</a
								>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Tracks Section -->
			<div class="section tracks" class:hide-on-mobile={selectedView !== 'tracks'}>
				<h2 class="section-title">Recently Played Tracks</h2>
				<div class="items-grid">
					{#each tracks as track}
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<div
							class="item {track.selected ? 'selected' : ''}"
							on:click={() => onSelect(track.id, 'track')}
						>
							<img src={track.image} alt={track.name} on:load={onImageLoad} />
							<div class="overlay">
								<span>{track.name}</span><br />

								{#if track.artist}
									<span class="artist-name">{track.artist.name}</span><br />
								{/if}
								<a href={track.spotifyUrl} style="color: #1db954;" target="_blank"
									>Listen on Spotify</a
								>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Footer Buttons -->
	{#if selectedCount > 0}
		<div class="fixed-footer">
			<button type="button" class="action-button secondary" on:click={onSubmit}>
				Select Genres
			</button>
			<span class="separator">or</span>
			<button type="button" class="action-button primary" on:click={onLetUsGo}> Find Clubs </button>
			<span class="separator">or</span>
			<button type="button" class="action-button primary" on:click={onLetsGoBars}>
				Find Bars
			</button>
		</div>
	{/if}
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

	.content {
		flex: 1;
	}

	/* Mobile Dropdown */
	.mobile-dropdown {
		width: 100%;
	}

	.dropdown-select {
		width: 100%;
		padding: 0.5rem;
		font-size: 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	/* Grid Container for Desktop */
	.grid-container {
		display: grid;
		grid-template-columns: repeat(1, 1fr); /* Start with a single column for mobile */
		gap: 1rem;
		justify-items: stretch;
		align-items: start;
	}
	.notification-banner {
		color: rgba(0, 0, 0, 0.5);
	}

	/* Responsive Grid for Desktop */
	@media (min-width: 768px) {
		.grid-container {
			grid-template-columns: repeat(3, 1fr); /* 3 columns on desktop */
		}
	}

	/* Section Styling */
	.section {
		margin-bottom: 2rem;
	}

	.section-title {
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	.items-grid {
		display: grid;
		grid-template-columns: repeat(1, minmax(200px, 1fr));
		gap: 1rem;
	}

	.item {
		display: flex;
		flex-direction: column;
		justify-content: space-between; /* Distribute content evenly */
		align-items: center; /* Center align content */
		text-align: center;
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
		object-fit: cover;
		border-radius: 2.5%;
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

	.overlay {
		background-color: rgba(0, 0, 0, 0.7); /* Optional: Semi-transparent background */
		color: white;
		padding: 10px;
		text-align: center;
		display: block;
		width: 100%;
		height: 60px; /* Make sure it's a block element */
		margin-top: 0px;
		overflow: hidden; /* Hide overflow content by default */
		transition: height 0.3s ease, overflow 0.3s ease;
	}
	.item:hover .overlay {
		height: 140px; /* Expanded height on hover */
		overflow: auto; /* Enable scrolling for overflowed content */
	}
	.overlay span {
		display: flex;
		align-items: center;
	}

	.artist-name {
		font-size: 1rem;
		color: #ccc;
		display: block; /* Ensure the artist name appears on a new line */
		margin-top: 1px; /* Add some space above the artist name */
	}

	/* Fixed Footer */
	.fixed-footer {
		position: fixed;
		bottom: 0;
		left: 0;
		width: 100%;
		background-color: #fff;
		padding: 1rem;
		box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
	}

	.action-button {
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.action-button.primary {
		background-color: #1db954;
		color: #fff;
	}
	.action-button.primary:hover {
		background-color: #1ed760; /* Slightly lighter green for hover */
	}

	.action-button.secondary {
		background-color: #535353;
		color: #fff;
	}

	.action-button.secondary:hover {
		background-color: #414141;
	}

	.separator {
		font-size: 1rem;
		color: #000;
	}

	/* Responsive Styles */
	@media (max-width: 768px) {
		/* Hide sections based on mobile selection */
		.hide-on-mobile {
			display: none;
		}
	}
	.update-section {
		max-width: 600px;
		margin: 0 auto;
		background-color: #fff;
		padding: 2rem;
		border-radius: 8px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
	}
	.section-header {
		font-size: 1.5rem;
		margin-bottom: 1rem;
		color: #333;
		text-align: center;
	}
	.description {
		font-size: 1rem;
		color: #666;
		text-align: center;
		margin-bottom: 1.5rem;
	}
	.form-card {
		padding: 1rem;
		background-color: #f9f9f9;
		border-radius: 8px;
	}
	.form-group {
		margin-bottom: 1rem;
	}
	.input-field {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}
	.btn {
		padding: 0.75rem 1.5rem;
		border-radius: 4px;
		cursor: pointer;
	}
	.btn-primary {
		background-color: #1db954;
		color: white;
	}
	.btn-submit {
		background-color: #1e90ff;
		color: white;
	}
	.btn:hover {
		opacity: 0.9;
	}
	.error-message {
		color: red;
		margin-top: 0.5rem;
	}
	.popup-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
	}
	.popup {
		background-color: white;
		padding: 1rem;
		border-radius: 8px;
	}
</style>
