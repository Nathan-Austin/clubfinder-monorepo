<!-- routes/bars/+page.svelte -->
<!-- This file is the main page for the bars page in the ClubFindr system. -->
<!-- It includes the main bar details section, bar events section, and bar details modal. -->

<script lang="ts">
	import type { PageData } from './$types';
	import { onMount, afterUpdate } from 'svelte';
	import Chart from 'chart.js/auto';
	import { goto } from '$app/navigation';
	import BarDetailsModal from './BarDetailsModal.svelte';
	import BarEventsSection from './BarEventsSection.svelte';
	export let data: PageData;
	export let currentRole = 'bar';

	let currentlyPlaying = data.currentlyPlaying || null;
	let nextTracks = data.nextTracks || [];
	let recentlyPlayedTracks = data.recentlyPlayedTracks || [];
	let topArtists = data.topArtists || [];
	let topPlaylists = data.playlists || [];
	let commonGenres = data.commonGenres || [];
	let barName = data.barName || null;
	let loggedOut: boolean = data.loggedOut;
	let showModal = false;
	let showBarDetailsModal = false;
	let genreChart;
	let hasDualRole = false;
	let error = data.error;

	// Check if we can access the barId directly from data
	let barId = data.barId;

	// Initial bar details state
	let barDetails = {
		id: '', // Add id field to store it if we can get it from the API
		name: barName || '',
		address: '',
		city: '',
		phone: '',
		email: '',
		openingHours: '',
		description: ''
	};

	let barDetailsLoading = false;
	let barDetailsError = '';
	let barDetailsSuccess = '';
	let barDetailsValidationErrors = [];

	let showDebugInfo = false;
	let manualBarId = '';

	function toggleDebugInfo() {
		showDebugInfo = !showDebugInfo;
	}

	function setManualBarId() {
		if (manualBarId) {
			console.log('Setting manual barId:', manualBarId);
			barDetails.id = manualBarId;
			document.cookie = `barId=${manualBarId}; path=/; max-age=3600; secure; samesite=lax`;
			alert(`Bar ID set to: ${manualBarId}`);
		}
	}

	// Function to handle Spotify API errors
	async function handleSpotifyApiError(error) {
		console.error('Spotify API error:', error);

		// Check if this is an authentication error
		if (
			error.status === 401 ||
			error.message?.includes('token') ||
			error.message?.includes('unauthorized') ||
			error.message?.includes('auth')
		) {
			// Show the reconnect modal
			showModal = true;
			return true; // Error handled
		}

		return false; // Not handled
	}

	function getCookie(name) {
		const value = `; ${document.cookie}`;
		const parts = value.split(`; ${name}=`);
		if (parts.length === 2) {
			const cookieValue = parts.pop().split(';').shift();
			console.log(`Retrieved cookie ${name}:`, cookieValue);
			return cookieValue;
		}
		console.log(`Cookie ${name} not found`);
		return null;
	}

	onMount(async () => {
		// Check for authentication issues
		if (loggedOut) {
			showModal = true;
		}

		// Check for dual role
		const cookies = document.cookie.split(';');
		for (let cookie of cookies) {
			const [name, value] = cookie.trim().split('=');
			if (name === 'hasDualRole' && value === 'true') {
				hasDualRole = true;
				break;
			}
		}

		// Setup the genre chart if we have data
		if (commonGenres?.length) {
			const ctx = document.getElementById('genreChart')?.getContext('2d');
			if (ctx) {
				genreChart = new Chart(ctx, {
					type: 'bar',
					data: {
						labels: commonGenres.map((g) => g.genre),
						datasets: [
							{
								label: 'Top Genres',
								data: commonGenres.map((g) => g.count),
								backgroundColor: 'rgba(75, 192, 192, 0.2)',
								borderColor: 'rgba(75, 192, 192, 1)',
								borderWidth: 1
							}
						]
					},
					options: {
						scales: {
							y: {
								beginAtZero: true
							}
						}
					}
				});
			}
		}

		// Listen for unhandled promise rejections - often Spotify API errors
		window.addEventListener('unhandledrejection', async (event) => {
			if (
				event.reason &&
				(event.reason.message?.includes('Spotify') ||
					event.reason.message?.includes('token') ||
					event.reason.message?.includes('unauthorized') ||
					event.reason.message?.includes('auth'))
			) {
				const handled = await handleSpotifyApiError(event.reason);
				if (handled) {
					event.preventDefault();
				}
			}
		});

		// Fetch bar details if needed
		try {
			// Try different methods to get barId
			let fetchBarId = getCookie('barId');

			// If not in cookie, try from page data
			if (!fetchBarId && barId) {
				fetchBarId = barId;
				console.log('Using barId from page data for fetch:', fetchBarId);
			}

			console.log('Fetching details for bar ID:', fetchBarId);

			if (fetchBarId) {
				const response = await fetch(`/api/bars/${fetchBarId}`);
				console.log('Bar details response status:', response.status);

				if (response.ok) {
					const barData = await response.json();
					console.log('Retrieved bar data:', barData);

					barDetails = {
						id: barData.id || '',
						name: barData.name || '',
						address: barData.address || '',
						city: barData.city || '',
						phone: barData.phone || '',
						email: barData.general_email || '',
						openingHours: barData.opening_hours || '',
						description: barData.description || ''
					};
				} else {
					console.error('Failed to fetch bar details, status:', response.status);
					try {
						const errorData = await response.json();
						console.error('Error response:', errorData);
					} catch {
						console.error('Could not parse error response');
					}
				}
			} else {
				console.error('No barId cookie found during bar details fetch');
			}
		} catch (error) {
			console.error('Error fetching bar details:', error);
		}
	});

	function closeModal() {
		showModal = false;
		// Redirect to Spotify reauth
		if (data.authUrl) {
			window.location.href = data.authUrl;
		} else {
			reconnectSpotify();
		}
	}

	function openBarDetailsModal() {
		showBarDetailsModal = true;
	}

	function closeBarDetailsModal() {
		showBarDetailsModal = false;
		barDetailsError = '';
		barDetailsSuccess = '';
		barDetailsValidationErrors = [];
	}

	async function handleBarDetailsSubmit(event) {
		const updatedDetails = event.detail;
		barDetailsLoading = true;
		barDetailsError = '';
		barDetailsSuccess = '';
		barDetailsValidationErrors = [];

		try {
			// Try different methods to get the barId
			// 1. Try to get barId from event data (from modal)
			let submissionBarId = updatedDetails.id;

			// 2. Try to get barId from cookie
			if (!submissionBarId) {
				submissionBarId = getCookie('barId');
			}

			// 3. If no barId in cookie, try to use the one from loaded bar details
			if (!submissionBarId && barDetails && barDetails.id) {
				submissionBarId = barDetails.id;
				console.log('Using barId from loaded details:', submissionBarId);
			}

			// 4. Try to use the barId from page data
			if (!submissionBarId && barId) {
				submissionBarId = barId;
				console.log('Using barId from page data:', submissionBarId);
			}

			console.log('Attempting to update bar with ID:', submissionBarId);

			if (!submissionBarId) {
				console.error('Bar ID not found in cookies, loaded data, or page data');
				throw new Error('Bar ID not found. Please log in again.');
			}

			// Log the request details
			console.log('Sending update to:', `/api/bars/${submissionBarId}`);
			console.log('Update payload:', {
				name: updatedDetails.name,
				address: updatedDetails.address,
				city: updatedDetails.city,
				phone: updatedDetails.phone,
				general_email: updatedDetails.email,
				opening_hours: updatedDetails.openingHours,
				description: updatedDetails.description
			});

			const response = await fetch(`/api/bars/${submissionBarId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					name: updatedDetails.name,
					address: updatedDetails.address,
					city: updatedDetails.city,
					phone: updatedDetails.phone,
					general_email: updatedDetails.email,
					opening_hours: updatedDetails.openingHours,
					description: updatedDetails.description
				})
			});

			console.log('Response status:', response.status);
			const responseData = await response.json();
			console.log('Response data:', responseData);

			if (response.ok) {
				barDetailsSuccess = responseData.message || 'Bar details updated successfully!';
				// Update the bar name in the UI if it changed
				if (updatedDetails.name !== barName) {
					barName = updatedDetails.name;
				}

				// Close modal after a delay
				setTimeout(() => {
					closeBarDetailsModal();
				}, 2000);
			} else {
				barDetailsError = responseData.message || 'Failed to update bar details';

				// Check for validation errors
				if (responseData.errors && Array.isArray(responseData.errors)) {
					barDetailsValidationErrors = responseData.errors;
				}
			}
		} catch (error) {
			console.error('Error updating bar details:', error);
			barDetailsError = error.message || 'An unexpected error occurred';
		} finally {
			barDetailsLoading = false;
		}
	}

	afterUpdate(() => {
		if (genreChart && commonGenres?.length) {
			genreChart.data.labels = commonGenres.map((g) => g.genre);
			genreChart.data.datasets[0].data = commonGenres.map((g) => g.count);
			genreChart.update();
		}
	});

	function switchRole() {
		if (currentRole === 'bar') {
			goto('/promoter-home');
		} else {
			goto('/bars');
		}
	}

	function reconnectSpotify() {
		window.location.href = `/spotify/reauth?returnTo=${encodeURIComponent(
			window.location.pathname
		)}`;
	}
</script>

{#if showModal}
	<div class="modal-backdrop">
		<div class="modal">
			<h2>Spotify Authentication Required</h2>
			<p>Your Spotify session has expired. Please reconnect to continue using the dashboard.</p>
			<button on:click={closeModal}>Reconnect Spotify</button>
		</div>
	</div>
{/if}

{#if showBarDetailsModal}
	<BarDetailsModal
		{barDetails}
		isLoading={barDetailsLoading}
		errorMessage={barDetailsError}
		validationErrors={barDetailsValidationErrors}
		successMessage={barDetailsSuccess}
		on:close={closeBarDetailsModal}
		on:submit={handleBarDetailsSubmit}
	/>
{/if}

{#if error}
	<div class="error-message">
		<p>{error}</p>
		<button on:click={reconnectSpotify} class="reconnect-button"> Reconnect Spotify </button>
	</div>
{/if}

<main class="dashboard-container">
	<a href="https://www.spotify.com" target="_blank">
		<img
			src="/lib/2024-spotify-full-logo/Full_Logo_White_CMYK.svg"
			alt="Spotify Logo"
			class="spotify-logo mr-4"
		/>
	</a>
	<header class="dashboard-header">
		<h1>{barName}'s Music Insights</h1>
		<p>Explore how your music choices are shaping the vibe at your bar.</p>

		<div class="dashboard-actions">
			<button on:click={reconnectSpotify} class="spotify-reconnect-btn"> Reconnect Spotify </button>
			<button on:click={openBarDetailsModal} class="bar-details-btn"> Update Bar Details </button>
		</div>
	</header>

	{#if hasDualRole}
		<div class="role-switcher">
			<button on:click={switchRole} class="switcher-button">
				Switch to {currentRole === 'bar' ? 'Promoter' : 'Bar Manager'} Dashboard
			</button>
		</div>
	{/if}

	<section class="current-next-container">
		<div class="currently-playing">
			<h2>Currently Playing</h2>
			<div class="current-track">
				{#if currentlyPlaying}
					<img
						src={currentlyPlaying.album.images[0].url}
						alt="Album cover for {currentlyPlaying.name}"
					/>
					<div class="track-details">
						<h3>{currentlyPlaying.name}</h3>
						<p>{currentlyPlaying.artists.map((a) => a.name).join(', ')}</p>
					</div>
				{:else}
					<p>No track is currently playing.</p>
				{/if}
			</div>
		</div>

		<div class="upcoming-tracks">
			<h2>Next Up</h2>
			<ul class="next-tracks">
				{#if nextTracks && nextTracks.length > 0}
					{#each nextTracks as track}
						<li class="queue-track">
							<!-- Add the album image -->
							{#if track.album?.images && track.album.images.length > 0}
								<img
									src={track.album.images[track.album.images.length - 1].url}
									alt="Album cover for {track.name}"
									class="queue-track-image"
								/>
							{/if}
							<div class="queue-track-info">
								<span class="track-name">{track.name}</span>
								<span class="track-artist">by {track.artists.map((a) => a.name).join(', ')}</span>
							</div>
						</li>
					{/each}
				{:else}
					<li>No upcoming tracks in queue</li>
				{/if}
			</ul>
		</div>
	</section>

	<section class="side-container">
		<div class="top-artists-playlists">
			<div class="top-artists">
				<h2>Top Artists</h2>
				<ul>
					{#each topArtists.slice(0, 10) as artist}
						<li>{artist.name}</li>
					{/each}
				</ul>
			</div>
			<div class="top-playlists">
				<h2>Top Playlists</h2>
				<ul>
					{#each topPlaylists.slice(0, 5) as playlist}
						<li>{playlist.name}</li>
					{/each}
				</ul>
			</div>
		</div>

		<div class="recently-played">
			<h2>Recently Played</h2>
			<ul>
				{#each recentlyPlayedTracks.slice(0, 5) as track}
					<li>
						<img src={track.album?.images[0]?.url} alt="Album cover for {track.name}" />
						<div>
							<p>{track.name} by {track.artists.map((a) => a.name).join(', ')}</p>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<section class="inline-graphs">
		<section class="genre-insights">
			<h2>Genre Insights</h2>
			<canvas id="genreChart" />
		</section>

		<section class="placeholder-section">
			<h2>Coming Soon: User Search Insights</h2>
			<div class="placeholder">
				Placeholder for future graph of what Clubfindr users are searching for in your area
			</div>
		</section>
	</section>
	<BarEventsSection {barId} />
</main>

<button on:click={toggleDebugInfo} class="debug-button">
	{showDebugInfo ? 'Hide Debug Info' : 'Show Debug Info'}
</button>

{#if showDebugInfo}
	<div class="debug-info">
		<h3>Debug Information</h3>

		<div class="manual-id-set">
			<input
				type="text"
				bind:value={manualBarId}
				placeholder="Enter bar ID manually"
				class="manual-id-input"
			/>
			<button on:click={setManualBarId} class="manual-id-button">Set ID</button>
		</div>

		<ul>
			<li>barId from page.js data: {barId || 'Not available'}</li>
			<li>barDetails.id: {barDetails.id || 'Not available'}</li>
			<li>Cookie barId: {getCookie('barId') || 'Not available'}</li>
			<li>Cookie barsName: {getCookie('barsName') || 'Not available'}</li>
			<li>Cookie bar_city: {getCookie('bar_city') || 'Not available'}</li>
		</ul>
	</div>
{/if}

<style>
	/* General Container */
	.dashboard-container {
		padding: 2rem;
	}
	.spotify-logo {
		width: 150px;
		margin-right: 1rem;
	}
	/* Header Styles */
	.dashboard-header {
		text-align: center;
		margin-bottom: 2rem;
		font-size: 2.5rem;
		font-weight: bold;
	}

	.dashboard-header p {
		font-size: 1rem;
		margin-top: 0.5rem;
		color: #555;
	}

	.dashboard-actions {
		display: flex;
		justify-content: center;
		gap: 1rem;
		margin-top: 1rem;
	}

	/* Currently Playing and Upcoming Tracks Container */
	.current-next-container {
		display: flex;
		justify-content: space-between;
		margin-bottom: 2rem;
	}
	.error-message {
		background-color: #ffebee;
		color: #c62828;
		padding: 1rem;
		margin-bottom: 1rem;
		border-radius: 4px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.reconnect-button {
		background-color: #1db954;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		cursor: pointer;
	}

	.spotify-reconnect-btn {
		background-color: transparent;
		color: #1db954;
		border: 1px solid #1db954;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.spotify-reconnect-btn:hover {
		background-color: rgba(29, 185, 84, 0.1);
	}

	.bar-details-btn {
		background-color: transparent;
		color: #2196f3;
		border: 1px solid #2196f3;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.bar-details-btn:hover {
		background-color: rgba(33, 150, 243, 0.1);
	}

	.currently-playing {
		width: 45%;
		text-align: left;
	}
	.currently-playing h2 {
		width: 45%;
		text-align: left;
		font-size: 1.2rem;
	}

	.upcoming-tracks {
		width: 35%;
		text-align: left;
	}
	.upcoming-tracks h2 {
		width: 35%;
		text-align: left;
		font-size: 1.2rem;
	}

	.current-track img {
		width: 150px;
		height: 150px;
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.track-details h3 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.track-details p {
		color: #777;
	}

	.next-tracks {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.next-tracks li {
		margin-bottom: 0.5rem;
	}
	.role-switcher {
		padding: 0.5rem;
	}

	.switcher-button {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 1rem;
		background-color: #f0f0f0;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 0.9rem;
		color: #333;
		cursor: pointer;
		transition: background-color 0.2s;
	}
	.queue-track {
		display: flex;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.queue-track-image {
		width: 40px;
		height: 40px;
		border-radius: 4px;
		margin-right: 0.75rem;
	}

	.queue-track-info {
		display: flex;
		flex-direction: column;
	}

	.track-name {
		font-weight: 500;
	}

	.track-artist {
		font-size: 0.9rem;
		color: #777;
	}

	.switcher-button:hover {
		background-color: #e0e0e0;
	}
	/* Section Title Styling */
	h2 {
		font-size: 1.5rem;
		margin-bottom: 1rem;
		position: relative;
		padding-bottom: 0.5rem;
	}

	h2::after {
		content: '';
		position: absolute;
		left: 0;
		bottom: 0;
		width: 100%;
		height: 2px;
		background-color: #ddd;
	}
	/* Side Container */
	.side-container {
		display: flex;
		justify-content: space-between;
	}

	/* Top Artists and Playlists */
	.top-artists-playlists {
		width: 35%;
		text-align: left;
	}

	.top-artists,
	.top-playlists {
		margin-bottom: 1rem;
	}

	.top-artists ul,
	.top-playlists ul {
		list-style: none;
		padding: 0;
	}

	.top-artists li,
	.top-playlists li {
		margin-bottom: 0.5rem;
	}

	/* Recently Played */
	.recently-played {
		width: 35%;
		text-align: left;
	}

	.recently-played ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.recently-played li {
		margin-bottom: 0.5rem;
		display: flex;
		align-items: center;
	}

	.recently-played img {
		width: 40px;
		height: 40px;
		margin-right: 0.5rem;
		border-radius: 4px;
	}

	/* Placeholder and Genre Insights Inline */
	.placeholder-section,
	.genre-insights {
		width: 45%; /* Adjusted width to be inline */
	}

	.inline-graphs {
		display: flex;
		justify-content: space-between;
		margin-top: 2rem;
	}

	.placeholder {
		height: 300px;
		background-color: #e0e0e0;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #777;
	}

	.genre-insights canvas {
		width: 100%; /* Full width of the section */
		height: 300px;
	}

	/* Modal Styles */
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: white;
		padding: 2rem;
		border-radius: 8px;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
		text-align: center;
		color: #333;
	}

	.modal button {
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		background-color: #1db954;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.modal button:hover {
		background-color: #1aa34a;
	}

	/* Debug Styles */
	.debug-button {
		position: fixed;
		bottom: 20px;
		right: 20px;
		padding: 0.5rem 1rem;
		background-color: #f5f5f5;
		color: #333;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 0.8rem;
		z-index: 1000;
		opacity: 0.7;
	}

	.debug-button:hover {
		opacity: 1;
	}

	.debug-info {
		position: fixed;
		bottom: 70px;
		right: 20px;
		width: 400px;
		max-width: 90vw;
		padding: 1rem;
		background-color: #fff;
		border: 1px solid #ddd;
		border-radius: 4px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
		z-index: 999;
		font-family: monospace;
		font-size: 0.8rem;
	}

	.debug-info h3 {
		margin-top: 0;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid #eee;
	}

	.debug-info ul {
		padding-left: 1.5rem;
		margin: 0.5rem 0;
	}

	.manual-id-set {
		display: flex;
		margin-bottom: 1rem;
		gap: 0.5rem;
	}

	.manual-id-input {
		flex-grow: 1;
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-family: monospace;
	}

	.manual-id-button {
		padding: 0.5rem 1rem;
		background-color: #2196f3;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.manual-id-button:hover {
		background-color: #1976d2;
	}
</style>
