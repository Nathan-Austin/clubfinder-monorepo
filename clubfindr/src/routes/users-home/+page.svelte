<script lang="ts">
	import { PUBLIC_MAPS_API_KEY, PUBLIC_SPOTIFY_REDIRECT_USER_URI } from '$env/static/public';
	import { onMount } from 'svelte';
	import { Chart, PieController, ArcElement, Tooltip, Legend } from 'chart.js';
	import { PUBLIC_SPOTIFY_CLIENT_ID } from '$env/static/public';
	import { DatePicker } from 'date-picker-svelte';
	import { toLocalIsoDate } from '$lib/localDate';
	import { Loader } from '@googlemaps/js-api-loader';
	import { getDistance } from 'geolib';
	//const PUBLIC_SPOTIFY_CLIENT_ID = 'd92712657a2c4805bda31175bcf576eb';
	// Register the required components for the pie chart
	Chart.register(PieController, ArcElement, Tooltip, Legend);

	// Spotify OAuth variables
	let clientId = PUBLIC_SPOTIFY_CLIENT_ID;

	// Chart instance type and data props
	let chart: Chart<'pie', number[], string> | undefined;
	interface Props {
		data: {
			props: {
				userName: string | null;
				topPreferences: Array<{ genre: string; search_count: number }>;
				interestedEvents: Array<{
					event_id: number; // Assuming this is the ID type
					club_name: string;
					event_name: string;
					event_date: string; // or Date, depending on how you're storing it
					attended?: string; // Store the attendance choice
					likedRecommendation?: string; // Store the feedback on recommendation
				}>;
				connectedServices: {
					spotify: boolean;
					soundcloud: boolean;
					tidal: boolean;
				};
			};
		};
	}

	let { data }: Props = $props();

	const userName: string | null = $derived(data.props.userName);
	const preferences: Array<{ genre: string; search_count: number }> = $derived(
		data.props.topPreferences || []
	);
	// Local copy: events are removed from it when the user un-marks them
	// svelte-ignore state_referenced_locally
	let interestedEvents = $state(data.props.interestedEvents || []);
	const connectedServices = $derived(
		data.props.connectedServices || {
			spotify: false,
			soundcloud: false,
			tidal: false
		}
	);

	// Keep track of the maximum visible events
	const maxVisibleEvents = 5;

	// Settings dropdown state
	let dropdownVisible = $state(false);

	// Editable copy of the name, re-seeded whenever the page data changes (writable derived)
	let newName: string = $derived(userName || '');

	// Date picker functionality
	let formattedDate: Date = $state(new Date());

	// Location and city selection functionality
	let geocoder: google.maps.Geocoder;
	let city1 = $state('');
	let closestCity = '';

	interface City {
		name: string;
		latitude: number;
		longitude: number;
		boundaries?: {
			west: number;
			north: number;
			east: number;
			south: number;
		};
		origin?: {
			lat: number;
			lng: number;
		};
		region?: string;
	}

	let cities: City[] = $state([]);
	let userDeniedLocation = false;
	let location: Position | null = null;
	let address = $state('');
	let isCitySelectionInvalid = $state(false);
	let showCityDropdown = $state(false);

	interface Position {
		coords: {
			latitude: number;
			longitude: number;
		};
	}

	// Function to fetch cities.json from the static folder
	async function fetchCities() {
		try {
			const response = await fetch('/lib/cities.json');
			if (response.ok) {
				const data = await response.json();
				cities = data.cities;
				console.log('Cities loaded:', cities);
			} else {
				console.error('Failed to load cities.json');
				cities = [];
			}
		} catch (error) {
			console.error('Error fetching cities.json:', error);
			cities = [];
		}
	}

	async function getAddress(coordinates: {
		latitude: number;
		longitude: number;
	}): Promise<google.maps.GeocoderResult | null> {
		try {
			const result = await new Promise<google.maps.GeocoderResult | null>((resolve, reject) => {
				geocoder.geocode(
					{ location: { lat: coordinates.latitude, lng: coordinates.longitude } },
					(results, status) => {
						if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
							resolve(results[0]);
						} else {
							reject(new Error(status.toString()));
						}
					}
				);
			});
			return result;
		} catch (error) {
			console.error(error);
			return null;
		}
	}

	async function updateLocation(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			navigator.geolocation.getCurrentPosition(
				async (position: Position) => {
					location = {
						coords: {
							latitude: position.coords.latitude,
							longitude: position.coords.longitude
						}
					};
					const addressResult = await getAddress(location.coords);
					if (addressResult) {
						address = addressResult.formatted_address;
					} else {
						address = 'Not available';
					}
					resolve();
				},
				(error) => {
					console.log(
						`Geolocation error (${error.code}): ${error.message}, setting userDeniedLocation to true.`
					);
					userDeniedLocation = true;
					reject(error); // User denied geolocation
				}
			);
		});
	}

	async function findClosestCity(userCoords: { latitude: number; longitude: number }) {
		const response = await fetch('/lib/cities.json');
		const data = await response.json();
		cities = data.cities;

		let minDistance = Infinity;

		data.cities.forEach((city: City) => {
			const distance = getDistance(
				{ latitude: userCoords.latitude, longitude: userCoords.longitude },
				{ latitude: city.latitude, longitude: city.longitude }
			);

			if (distance < minDistance) {
				minDistance = distance;
				closestCity = city.name;
			}
		});

		if (closestCity) {
			city1 = closestCity;
			console.log(`Closest city is: ${closestCity}`);
			document.cookie = `closestCity=${closestCity}; path=/`; // Set cookie with the closest city
		}
	}

	function handleCitySelection(event: Event) {
		const target = event.target as HTMLSelectElement;
		const selectedCity = target.value;
		if (selectedCity) {
			city1 = selectedCity;
			isCitySelectionInvalid = false;
			console.log(`User selected city: ${selectedCity}`);
		}
	}

	async function extractCity(address: string): Promise<string | null> {
		const addressParts = address.split(',');

		if (addressParts.length >= 3) {
			const potentialCityPart = addressParts[addressParts.length - 2].trim();

			const postalCodePattern =
				/\b\d{5}(?:[-\s]\d{4})?\b|\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/i;

			const cityParts = potentialCityPart.split(/\s+/);

			const firstPart = cityParts[0];
			if (postalCodePattern.test(firstPart)) {
				const city = cityParts.slice(1).join(' ').trim();
				if (city) {
					console.log(`City extracted: ${city}`);
					return city;
				}
			}

			const lastPart = cityParts[cityParts.length - 1];
			if (postalCodePattern.test(lastPart)) {
				const city = cityParts.slice(0, -1).join(' ').trim();
				if (city) {
					console.log(`City extracted: ${city}`);
					return city;
				}
			}

			console.log(`City extracted (no postal code): ${potentialCityPart}`);
			return potentialCityPart;
		}

		console.warn('No city found in the address');
		return null;
	}

	const updateName = async () => {
		const response = await fetch('/api/update-user-name', {
			method: 'POST',
			body: JSON.stringify({ newName }),
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (response.ok) {
			alert('Name updated successfully');
		} else {
			alert('Failed to update name');
		}
	};

	// Load the user-specific client ID on component mount
	async function loadClientId() {
		try {
			const response = await fetch('/api/get-spotify-app');
			if (response.ok) {
				const data = await response.json();
				if (data.clientId) {
					clientId = data.clientId;
					console.log('Loaded client ID:', clientId);
				}
			}
		} catch (error) {
			console.error('Failed to load Spotify client ID:', error);
			// Fall back to PUBLIC_SPOTIFY_CLIENT_ID if there's an error
		}
	}

	// Function for the user home page Spotify button click handler
	async function handleSpotifyButtonClick(event: MouseEvent) {
		// Always prevent default
		event.preventDefault();

		console.log('Spotify button clicked');

		try {
			// Generate a secure state key
			const stateKey = Date.now().toString();
			console.log('Generated state key:', stateKey);

			// State data
			const cityValue = city1;
			console.log('City value store for form:', cityValue);

			if (!cityValue && userDeniedLocation) {
				isCitySelectionInvalid = true;
				const citySelect = document.getElementById('city-select');
				if (citySelect) {
					citySelect.scrollIntoView({ behavior: 'smooth' });
					citySelect.classList.add('flash');
				}
				console.log('City not selected. Please select a city.');
				return;
			}

			const formData = {
				city: cityValue || 'berlin',
				formattedDate: toLocalIsoDate(formattedDate),
				source: 'user-home' // Add source identifier to help with redirect
			};

			console.log('Storing state data with source:', formData);

			// Store state
			const stateResponse = await fetch('/storestate', {
				method: 'POST',
				body: JSON.stringify({ key: stateKey, state: JSON.stringify(formData) }),
				headers: {
					'Content-Type': 'application/json'
				},
				credentials: 'include'
			});

			if (!stateResponse.ok) {
				const errorText = await stateResponse.text();
				console.error('Failed to store state:', errorText);
				throw new Error('Failed to store state: ' + errorText);
			}

			console.log('State stored successfully');

			// Make sure we have the client ID
			if (!clientId) {
				console.log('Loading client ID');
				await loadClientId();
			}

			console.log('Using client ID:', clientId ? clientId.substring(0, 5) + '...' : 'missing');

			// ALWAYS force show_dialog=true to ensure the window opens
			const showDialog = 'true';

			// Use redirect URI from environment if available
			const redirectUri = encodeURIComponent(
				PUBLIC_SPOTIFY_REDIRECT_USER_URI || 'https://www.clubfindr.com/spotify/login'
			);

			console.log('Using redirect URI:', decodeURIComponent(redirectUri));

			// Fix scope parameter (the previous version had syntax issues)
			const scopes = [
				'user-read-recently-played',
				'user-read-currently-playing',
				'playlist-read-private',
				'user-top-read',
				'user-read-email',
				'user-read-playback-state'
			].join('%20');

			// Construct the authorization URL
			const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&state=${stateKey}&scope=${scopes}&show_dialog=${showDialog}`;

			console.log('About to redirect to:', authUrl);

			// Add a small delay to ensure logging completes
			setTimeout(() => {
				// Redirect to Spotify authorization
				window.location.href = authUrl;
			}, 100);
		} catch (error) {
			console.error('Error in Spotify connection:', error);
			// Show error to user
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			alert('Failed to connect to Spotify: ' + errorMessage);
		}
	}

	async function handleSoundCloudButtonClick(event: MouseEvent) {
		event.preventDefault();
		try {
			const stateKey = Date.now().toString();
			const cityValue = city1;

			const formData = {
				city: cityValue || 'berlin',
				formattedDate: toLocalIsoDate(formattedDate),
				source: 'user-home'
			};

			await fetch('/storestate', {
				method: 'POST',
				body: JSON.stringify({ key: stateKey, state: JSON.stringify(formData) }),
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include'
			});

			window.location.href = connectedServices.soundcloud
				? '/soundcloud'
				: `/api/soundcloud/auth?return_to=users-home&state=${stateKey}`;
		} catch (e) {
			console.error(e);
		}
	}

	async function handleTidalButtonClick(event: MouseEvent) {
		event.preventDefault();
		try {
			const stateKey = Date.now().toString();
			const cityValue = city1;

			const formData = {
				city: cityValue || 'berlin',
				formattedDate: toLocalIsoDate(formattedDate),
				source: 'user-home'
			};

			await fetch('/storestate', {
				method: 'POST',
				body: JSON.stringify({ key: stateKey, state: JSON.stringify(formData) }),
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include'
			});

			window.location.href = connectedServices.tidal
				? '/tidal'
				: `/api/tidal/auth?return_to=users-home&state=${stateKey}`;
		} catch (e) {
			console.error(e);
		}
	}
	// Function to toggle dropdown visibility
	function toggleDropdown() {
		dropdownVisible = !dropdownVisible;
	}

	const removeEvent = (eventId: number) => {
		// Remove the event from the interestedEvents array
		interestedEvents = interestedEvents.filter((event) => event.event_id !== eventId);
	};

	const handleAttendanceChange = (event: Event) => {
		const target = event.target as HTMLSelectElement;
		if (target.value === '0') {
			removeEvent(parseInt(target.dataset.eventId || '0', 10));
		}
	};

	const handleRecommendationChange = (event: Event) => {
		const target = event.target as HTMLSelectElement;
		if (target.value !== '') {
			removeEvent(parseInt(target.dataset.eventId || '0', 10));
		}
	};

	onMount(() => {
		// Load the Spotify client ID (async call)
		loadClientId();

		// Initialize Google Maps Geocoding API and fetch cities
		(async () => {
			try {
				// Fetch cities data
				await fetchCities();

				// Initialize Google Maps Geocoding API
				const loader = new Loader({
					apiKey: PUBLIC_MAPS_API_KEY,
					version: 'weekly',
					libraries: ['places']
				});

				loader
					.importLibrary('geocoding')
					.then(async (library) => {
						geocoder = new library.Geocoder();

						try {
							await updateLocation(); // Try to get user's location

							if (location) {
								// Extract city from the address
								if (address) {
									const city = await extractCity(address);
									if (city) {
										city1 = city;
										console.log(`City from extractCity: ${city}`);
									} else {
										console.log('No city extracted');
									}
								} else {
									console.log('Address is not available yet');
								}

								// Find the closest city based on geolocation
								await findClosestCity(location.coords);
							} else {
								console.log('User location is not available');
							}
						} catch (locationError) {
							console.log(
								'Location retrieval failed, setting userDeniedLocation to true:',
								locationError
							);
							userDeniedLocation = true;
						}
					})
					.catch((e) => {
						console.warn(
							"Couldn't load geocoding from Google Maps, setting userDeniedLocation to true"
						);
						console.error(e);
						userDeniedLocation = true; // Trigger dropdown if geocoding fails
					});
			} catch (error) {
				console.error('Error in onMount, setting userDeniedLocation to true:', error);
				userDeniedLocation = true; // Fallback if any other error occurs
			}
		})(); // Close async IIFE

		if (preferences.length > 0) {
			const canvas = document.getElementById('myChart') as HTMLCanvasElement;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;

			// Define an array of colors for each genre
			const colors = [
				'rgba(75, 192, 192, 0.6)', // Light blue
				'rgba(255, 206, 86, 0.6)', // Light yellow
				'rgba(255, 99, 132, 0.6)', // Light pink
				'rgba(54, 162, 235, 0.6)', // Light sky blue
				'rgba(153, 102, 255, 0.6)', // Light purple
				'rgba(255, 159, 64, 0.6)', // Light orange
				'rgba(75, 192, 75, 0.6)', // Light green
				'rgba(192, 192, 192, 0.6)' // Light grey
				// Add more colors if needed
			];

			// Create the pie chart
			chart = new Chart(ctx, {
				type: 'pie' as const,
				data: {
					labels: preferences.map((pref) => pref.genre),
					datasets: [
						{
							label: 'Genre Preferences',
							data: preferences.map((pref) => pref.search_count),
							backgroundColor: preferences.map((_, index) => colors[index % colors.length]),
							borderColor: preferences.map((_, index) =>
								colors[index % colors.length].replace('0.6', '1')
							),
							borderWidth: 1
						}
					]
				},
				options: {
					plugins: {
						tooltip: {
							callbacks: {
								label: function (tooltipItem) {
									return `${tooltipItem.label}: ${tooltipItem.raw}`;
								}
							}
						},
						legend: {
							display: true,
							position: 'top',
							labels: {
								color: 'white'
							}
						}
					},
					animation: {
						duration: 2000,
						easing: 'easeOutQuart'
					}
				}
			});
		}

		return () => {
			if (chart) chart.destroy();
		};
	});
</script>

<svelte:head>
	<title>Clubfindr User profile home page - Discover Clubs and Bars Based on Music You Love</title>
	<meta
		name="description"
		content="Your insights from Clubfindr, Find your favorite clubs and what genres you love to party to. The platform that helps you find clubs and bars based on your favorite music styles and artists. Discover new places, meet people, and explore the nightlife in your city or any new city."
	/>
	<meta
		name="keywords"
		content="Clubfindr, nightlife, clubs, bars, music, club recommendations, music venues, nightlife guide, find clubs, find bars"
	/>
	<meta name="author" content="Clubfindr Team" />
	<meta
		property="og:title"
		content="Clubfindr User Home - Discover Clubs and Bars Based on Music You Love"
	/>
	<meta
		property="og:description"
		content="Clubfindr helps you find clubs and bars that play the music you love. Whether you're looking for new spots in your city or exploring a new one, Clubfindr has got you covered."
	/>
	<meta property="og:image" content="/clubfindr.png" />
	<meta property="og:url" content="https://clubfindr.com/users-home" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<!-- Hidden form to store data -->
<form id="city-location" action="/storestate" method="POST">
	<input type="hidden" bind:value={city1} name="city" />
	<input type="hidden" bind:value={address} name="address" />
	<input type="hidden" value={toLocalIsoDate(formattedDate)} name="formattedDate" />
	<button type="button" id="form-submit-button" class="hidden">Submit</button>
</form>

<h1
	class="text-4xl md:text-8xl font-bold text-transparent bg-clip-text bg-linear-to-br from-light via-light to-secondary"
>
	Clubfindr Profile
</h1>
<div class="profile-header">
	{#if userName !== null && userName !== undefined && userName.trim() !== ''}
		<p class="welcome-text">Welcome, {userName}!</p>
	{:else}
		<p class="welcome-text">Please update your name to complete your profile.</p>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				updateName();
			}}
		>
			<label for="name">Name:</label>
			<input type="text" id="name" bind:value={newName} placeholder="Enter your name" />
			<button type="submit" class="button">Update Name</button>
		</form>
	{/if}

	<div class="settings-container">
		<button class="settings-button" onclick={toggleDropdown}>
			<span class="desktop">Settings</span>
			<span class="mobile">&#9776;</span>
			<!-- Hamburger icon for mobile -->
		</button>
		<!-- Dropdown Menu -->
		<div class="dropdown-menu {dropdownVisible ? 'visible' : ''}">
			<ul>
				<li>
					<button onclick={() => (window.location.href = '/update-info')}>Update My Info</button>
				</li>
				<li>
					<button onclick={() => (window.location.href = '/delete-confirmation')}
						>Delete My Data</button
					>
				</li>
			</ul>
		</div>
	</div>
</div>

<!-- Date and Location Section -->
<div class="date-location-section">
	<div class="date-picker-container">
		<h3>Choose Date for Events</h3>
		<DatePicker bind:value={formattedDate} />
		<p class="selected-date">
			{new Intl.DateTimeFormat('en-GB', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			}).format(formattedDate)}
		</p>
	</div>

	<div class="city-display">
		<h3>Current City</h3>
		<div class="city-info">
			<p class="current-city">{city1 || 'Detecting your location...'}</p>
			<button class="change-city-btn" onclick={() => (showCityDropdown = !showCityDropdown)}>
				Change City
			</button>
		</div>

		{#if showCityDropdown}
			<div class="city-dropdown">
				<select
					id="city-select"
					class:isInvalid={isCitySelectionInvalid}
					onchange={(e) => {
						handleCitySelection(e);
						showCityDropdown = false;
					}}
					style="color: black;"
				>
					<option value="" selected disabled>Select a city</option>
					{#each cities as city (city.name)}
						<option value={city.name} style="color: black;">{city.name}</option>
					{/each}
				</select>
				{#if isCitySelectionInvalid}
					<p class="text-red-500 flash">Please select a city before continuing.</p>
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Music Service Connections Section -->
<div class="service-connections">
	<h2>Your Music Services</h2>
	<p>Connect and use your music streaming accounts with Clubfindr.</p>

	<div class="connection-cards">
		<div class="connection-card">
			<div class="card-content">
				<h3>Spotify</h3>
				<p>
					{#if connectedServices.spotify}
						Your Spotify account is connected. Click below to browse your music preferences.
					{:else}
						Connect your Spotify account to find clubs that match your music taste.
					{/if}
				</p>
				<!-- Use button element for better accessibility -->

				<button
					type="button"
					onclick={handleSpotifyButtonClick}
					class="connect-button spotify-button"
					aria-label="Login with Spotify"
				>
					<span>{connectedServices.spotify ? 'Go to' : 'Connect with'}</span>
					<img
						src="/lib/2024-spotify-full-logo/Full_Logo_Black_PMS_C.svg"
						alt="Spotify Logo"
						class="spotify-logo"
					/>
				</button>
			</div>
		</div>

		<div class="connection-card">
			<div class="card-content">
				<h3>SoundCloud</h3>
				<p>
					{#if connectedServices.soundcloud}
						Your SoundCloud account is connected. Click below to browse your music preferences.
					{:else}
						Connect your SoundCloud account to discover clubs playing your favorite tracks.
					{/if}
				</p>
				<button
					type="button"
					onclick={handleSoundCloudButtonClick}
					class="connect-button soundcloud-button"
					aria-label="Login with SoundCloud"
				>
					{connectedServices.soundcloud ? 'Go to' : 'Connect with'} SoundCloud
				</button>
			</div>
		</div>

		<div class="connection-card">
			<div class="card-content">
				<h3>Tidal</h3>
				<p>
					{#if connectedServices.tidal}
						Your Tidal account is connected. Click below to browse your music preferences.
					{:else}
						Connect your Tidal account to discover clubs matching your high-fidelity taste.
					{/if}
				</p>
				<button
					type="button"
					onclick={handleTidalButtonClick}
					class="connect-button tidal-button"
					aria-label="Login with Tidal"
				>
					<span>{connectedServices.tidal ? 'Go to' : 'Connect with'}</span>
					<img src="/lib/tidal_logo.png" alt="Tidal Logo" class="tidal-logo-img" />
				</button>
			</div>
		</div>
	</div>
</div>

<!-- Flex container for headers and their content -->
<div class="header-container">
	<div class="header-content">
		<h2>Your Top Genre Search Preferences</h2>
		<h2>Events You Showed Interest In</h2>
	</div>
	<hr />
	<!-- Horizontal line for separation -->
</div>

<div class="flex-container">
	<div class="chart-container">
		{#if preferences.length > 0}
			<canvas id="myChart"></canvas>
		{:else}
			<p>No genre preferences found.</p>
		{/if}
	</div>
	<div class="additional-content">
		{#if interestedEvents.length > 0}
			<ul>
				{#each interestedEvents.slice(0, maxVisibleEvents) as event (event.event_id)}
					<li>
						<h4>{event.event_name}</h4>
						<p>At: {event.club_name}</p>
						<p>On: {new Date(event.event_date).toLocaleDateString()}</p>
						<div class="feedback">
							<label>
								Did you attend?
								<select
									data-event-id={event.event_id}
									bind:value={event.attended}
									onchange={handleAttendanceChange}
								>
									<option value=""></option>
									<option value="0">No</option>
									<option value="1">Yes</option>
								</select>
							</label>

							{#if event.attended === '1'}
								<label>
									Did you like the recommendation?
									<select
										data-event-id={event.event_id}
										bind:value={event.likedRecommendation}
										onchange={handleRecommendationChange}
									>
										<option value=""></option>
										<option value="0">No</option>
										<option value="1">Yes</option>
									</select>
								</label>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p>No interested events found.</p>
		{/if}
	</div>
</div>

<style>
	.profile-header {
		display: flex;
		justify-content: space-between; /* Align the "Welcome" in the center and dropdown to the right */
		align-items: center;
		position: relative; /* So the dropdown is positioned relative to this container */
		margin-bottom: 10px;
	}

	/* Date and Location Section */
	.date-location-section {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		background-color: rgba(30, 30, 30, 0.5);
		border-radius: 10px;
		border: 2px solid #ccc;
		padding: 1rem;
		margin: 1rem 0;
	}

	.date-picker-container,
	.city-display {
		flex: 1;
		padding: 0.5rem;
	}

	.date-picker-container h3,
	.city-display h3 {
		margin-bottom: 0.5rem;
		font-size: 1.2rem;
	}

	.city-info {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.change-city-btn {
		background-color: #3498db;
		color: white;
		border: none;
		border-radius: 4px;
		padding: 6px 12px;
		font-size: 0.9rem;
		cursor: pointer;
		transition: background-color 0.3s;
	}

	.change-city-btn:hover {
		background-color: #2980b9;
	}

	.city-dropdown {
		margin-top: 0.5rem;
		transition: all 0.3s ease;
	}

	.selected-date,
	.current-city {
		margin-top: 0.5rem;
		font-size: 1.1rem;
		font-weight: bold;
	}

	#city-select {
		width: 100%;
		padding: 8px;
		border: 1px solid #ccc;
		border-radius: 4px;
		background-color: white;
		transition: all 0.3s ease;
	}

	#city-select.isInvalid {
		border-color: red;
	}

	/* Flashing effect for the invalid select box */
	.flash {
		animation: flash 0.5s ease-in-out 0s 2;
	}

	@keyframes flash {
		0% {
			border-color: transparent;
		}
		50% {
			border-color: red;
		}
		100% {
			border-color: transparent;
		}
	}

	/* Flexbox for layout */
	.flex-container {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: flex-start;
	}

	.chart-container {
		flex: 2;
		margin-right: 10px;
	}

	.additional-content {
		flex: 1;
		padding-left: 40px;
		border: 2px solid #ccc;
		border-radius: 10px;
		padding: 20px;
	}

	.header-container {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		margin-bottom: 20px;
	}

	.header-content {
		display: flex;
		justify-content: space-between; /* Place h2 headers on the same line */
	}

	/* Style for the horizontal line */
	hr {
		border: 1px solid #ccc; /* Line style */
		margin: 10px 0; /* Add spacing around the line */
	}

	.button {
		padding: 8px 15px;
		background-color: #3498db;
		color: white;
		border: none;
		border-radius: 5px;
		cursor: pointer;
		transition: background-color 0.3s;
	}

	canvas {
		width: 100%;
		height: 80vh;
	}

	.feedback {
		margin-top: 10px;
		color: white;
	}

	.feedback label {
		display: block;
		margin-bottom: 5px;
		color: white;
	}

	.feedback select {
		color: black;
	}
	.dropdown-menu {
		display: none; /* Initially hidden */
		position: absolute;
		top: 100%;
		right: 0;
		background-color: white;
		border: 1px solid #ccc;
		border-radius: 5px;
		box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.1);
		padding: 10px;
		z-index: 1000;
		color: black;
	}

	.dropdown-menu.visible {
		display: block; /* Make it visible when dropdownVisible is true */
	}

	.dropdown-menu ul {
		list-style-type: none;
		margin: 0;
		padding: 0;
	}

	.dropdown-menu ul li {
		margin-bottom: 10px;
	}

	.dropdown-menu ul li:last-child {
		margin-bottom: 0;
	}
	.settings-button .desktop {
		display: none;
	}

	.settings-button .mobile {
		display: inline-block;
		font-size: 24px; /* Hamburger size */
		cursor: pointer;
	}

	/* Service connections styling */
	.service-connections {
		margin: 2rem 0;
		padding: 1.5rem;
		border-radius: 10px;
		border: 2px solid #ccc;
		background-color: rgba(30, 30, 30, 0.5);
	}

	.service-connections h2 {
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
		color: white;
	}

	.connection-cards {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 1rem;
	}

	.connection-card {
		flex: 1;
		min-width: 250px;
		border-radius: 8px;
		background-color: rgba(50, 50, 50, 0.7);
		overflow: hidden;
		transition: transform 0.2s ease;
	}

	.connection-card:hover {
		transform: translateY(-5px);
	}

	.card-content {
		padding: 1.5rem;
	}

	.card-content h3 {
		font-size: 1.2rem;
		margin-bottom: 0.5rem;
	}

	.connect-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 0.75rem;
		margin-top: 1rem;
		border: none;
		border-radius: 4px;
		font-weight: bold;
		cursor: pointer;
		transition: opacity 0.2s ease;
		text-decoration: none;
	}

	.connect-button:hover {
		opacity: 0.9;
	}

	.spotify-button {
		background-color: #1db954;
		color: white;
	}

	.spotify-button span {
		margin-right: 8px;
	}

	.spotify-logo {
		height: 24px;
		width: auto;
	}

	.soundcloud-button {
		background-color: #ff5500;
		color: white;
	}

	.tidal-button {
		background-color: #000000;
		color: white;
		border: 1px solid #00ffff !important;
	}

	.tidal-button:hover {
		box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
	}

	.tidal-logo-img {
		height: 20px;
		width: auto;
		margin-left: 8px;
	}

	/* Date Picker styling overrides */
	:global(body) {
		--date-picker-foreground: #f7f7f7;
		--date-picker-background: #16171c;
		--date-picker-highlight-border: hsl(var(--deg), 98%, 49%);
		--date-picker-highlight-shadow: hsla(var(--deg), 98%, 49%, 50%);
		--date-picker-selected-color: hsl(var(--deg), 100%, 85%);
		--date-picker-selected-background: hsla(var(--deg), 98%, 49%, 20%);
	}

	:global(.date-picker) {
		margin: 0 auto;
		max-width: 300px;
	}

	:global(.date-picker .calendar) {
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	:global(.date-picker .calendar-header) {
		padding: 10px;
	}

	:global(.date-picker .calendar-body) {
		padding: 10px;
	}

	/* Mobile-specific styles */
	@media (max-width: 768px) {
		.date-location-section {
			flex-direction: column;
		}

		.date-picker-container,
		.city-display {
			width: 100%;
			margin-bottom: 1rem;
		}

		.flex-container {
			flex-direction: column;
		}

		/* Adjust chart container flex */
		.chart-container {
			flex: 1;
			margin-bottom: 20px;
		}

		.additional-content {
			padding-left: 0;
		}

		/* Ensure headers stick with their respective content */
		.header-container {
			flex-direction: column;
		}

		.header-content {
			flex-direction: column;
			justify-content: flex-start;
		}
		.settings-button .desktop {
			display: inline-block;
		}
		.settings-button .mobile {
			display: none;
		}

		.connection-card {
			min-width: 100%;
		}
	}
</style>
