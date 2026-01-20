<!-- routes/register/+page.svelte -->
<!-- This file is the registration page for a new bar in the ClubFindr system. -->
<!-- It includes the registration form, reCAPTCHA verification, and integration with the Spotify service. -->

<script lang="ts">
	import { onMount } from 'svelte';
	import { validatePassword } from '$lib/passwordUtils';
	import { PUBLIC_SPOTIFY_CLIENT_ID } from '$env/static/public';
	import { Loader } from '@googlemaps/js-api-loader';
	import type { CitiesData, City } from '$lib/types/city';

	const siteKey = import.meta.env.VITE_reCAPTCHA_SITE_KEY;
	let isVerified = false;
	let cityError = '';
	let citiesData: CitiesData = { cities: [] };
	let selectedCityName = '';
	let selectedCityDetails: City | null = null;
	let businessName = '';
	let contactPerson = '';
	let email = '';
	let phone = '';
	let address = '';
	let postcode = '';
	let website = '';
	let musicService = '';
	let agreeToTerms = false;
	let agreeToPrivacyPolicy = false;
	let password = '';
	let confirmPassword = '';
	let passwordErrors: string[] = [];
	let predictions: string[] = [];
	let appleClientId = '';
	let deezerAppId = '';
	let isSubmitting = false;
	let phoneError = '';
	let emailError = '';
	let businessNameError = '';
	let musicServiceEmail = '';

	const clientId = PUBLIC_SPOTIFY_CLIENT_ID;
	const mapsApiKey = import.meta.env.VITE_MAPS_API_KEY;

	// Function to validate email
	function validateEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		const isValid = emailRegex.test(email);
		emailError = isValid ? '' : 'Please enter a valid email address';
		return isValid;
	}

	// Function to validate phone number
	function validatePhone(phone: string): boolean {
		// Allow +, spaces, and numbers
		const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
		const isValid = phoneRegex.test(phone);
		phoneError = isValid ? '' : 'Please enter a valid phone number';
		return isValid;
	}

	// Function to validate business name
	function validateBusinessName(name: string): boolean {
		const isValid = name.length >= 2 && name.length <= 100;
		businessNameError = isValid ? '' : 'Business name must be between 2 and 100 characters';
		return isValid;
	}

	// Function to validate passwords
	function validatePasswords() {
		const validation = validatePassword(password);
		passwordErrors = validation.errors;

		if (password !== confirmPassword) {
			passwordErrors = [...passwordErrors, 'Passwords do not match'];
		}

		return passwordErrors.length === 0;
	}

	// Load cities data and Google Maps Places library
	onMount(async () => {
		try {
			const response = await fetch('/lib/cities.json');
			citiesData = await response.json();

			selectedCityName = '';
			selectedCityDetails = null;

			// Load Google Maps using the official loader
			const loader = new Loader({
				apiKey: mapsApiKey,
				version: 'weekly',
				libraries: ['places']
			});

			await loader.load();
			console.log('Google Maps script loaded');

			// Load reCAPTCHA API asynchronously
			const recaptchaScript = document.createElement('script');
			recaptchaScript.src = 'https://www.google.com/recaptcha/api.js';
			recaptchaScript.async = true;
			recaptchaScript.defer = true;
			document.head.appendChild(recaptchaScript);
		} catch (error) {
			console.error('Error in onMount:', error);
		}
	});

	// Function to get city details from cities.json
	function getCityDetails(cityName: string): City | null {
		return (
			citiesData.cities.find((city) => city.name.toLowerCase() === cityName.toLowerCase()) || null
		);
	}

	async function fetchPredictions() {
		if (!selectedCityDetails || !google?.maps) {
			console.error('City details or Google Maps not available');
			return;
		}

		try {
			await google.maps.importLibrary('places');
			const service = new google.maps.places.AutocompleteService();
			const token = new google.maps.places.AutocompleteSessionToken();

			const request = {
				input: businessName,
				location: new google.maps.LatLng(
					selectedCityDetails.origin.lat,
					selectedCityDetails.origin.lng
				),
				bounds: new google.maps.LatLngBounds(
					new google.maps.LatLng(
						selectedCityDetails.boundaries.south,
						selectedCityDetails.boundaries.west
					),
					new google.maps.LatLng(
						selectedCityDetails.boundaries.north,
						selectedCityDetails.boundaries.east
					)
				),
				types: ['establishment'],
				language: 'en',
				region: selectedCityDetails.region || 'gb',
				sessionToken: token
			};

			const response: google.maps.places.AutocompleteResponse =
				await service.getPlacePredictions(request);
			if (response.predictions) {
				predictions = response.predictions.map((prediction) => prediction.description);
			}
		} catch (error) {
			console.error('Error fetching predictions:', error);
			predictions = [];
		}
	}

	async function selectPlace(prediction: string) {
		try {
			const service = new google.maps.places.PlacesService(document.createElement('div'));

			const request = {
				query: prediction,
				fields: ['place_id']
			};
			service.findPlaceFromQuery(request, async (results, status) => {
				if (status === google.maps.places.PlacesServiceStatus.OK && results && results[0]) {
					const placeId = results[0].place_id;
					if (!placeId) {
						return;
					}

					const detailsRequest: google.maps.places.PlaceDetailsRequest = {
						placeId,
						fields: ['name', 'address_components', 'formatted_address']
					};
					service.getDetails(detailsRequest, (place, status) => {
						if (status === google.maps.places.PlacesServiceStatus.OK && place) {
							businessName = place.name ?? '';
							validateBusinessName(businessName);

							const addressComponents = place.address_components ?? [];
							const streetNumber =
								addressComponents.find((component) => component.types.includes('street_number'))
									?.long_name || '';
							const streetName =
								addressComponents.find((component) => component.types.includes('route'))
									?.long_name || '';
							const postalCode =
								addressComponents.find((component) => component.types.includes('postal_code'))
									?.long_name || '';

							address = `${streetName} ${streetNumber}`.trim();
							postcode = postalCode;
							predictions = [];
						}
					});
				}
			});
		} catch (error) {
			console.error('Error fetching place details:', error);
		}
	}

	// Function to handle form submission
	async function register(event: Event) {
		event.preventDefault();
		if (isSubmitting) return;

		// Validate all fields
		const isEmailValid = validateEmail(email);
		const isPhoneValid = validatePhone(phone);
		const isBusinessNameValid = validateBusinessName(businessName);
		const isCityValid = validateCity(selectedCityName);
		const arePasswordsValid = validatePasswords();

		if (
			!isEmailValid ||
			!isPhoneValid ||
			!isBusinessNameValid ||
			!isCityValid ||
			!arePasswordsValid
		) {
			return;
		}

		if (!agreeToTerms || !agreeToPrivacyPolicy) {
			alert('You must agree to the Terms and Conditions and Privacy Policy to register.');
			return;
		}

		isSubmitting = true;

		try {
			const registerResponse = await fetch('/register', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					businessName,
					contactPerson,
					email,
					phone,
					address,
					cityName: selectedCityName,
					postcode,
					website,
					musicService,
					password,
					musicServiceEmail
				})
			});

			const result = await registerResponse.json();

			if (result.success) {
				if (musicService === 'Spotify') {
					const scopes = [
						'user-read-playback-state',
						'user-read-currently-playing',
						'playlist-read-private',
						'playlist-read-collaborative',
						'user-read-recently-played',
						'user-top-read',
						'user-library-read',
						'user-read-email'
					].join(' ');
					const redirectUri = encodeURIComponent('https://www.clubfindr.com/register/login');
					const authorizationUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${encodeURIComponent(
						scopes
					)}&show_dialog=true`;
					window.location.href = authorizationUrl;
				} else if (musicService === 'Apple Music') {
					const redirectUri = encodeURIComponent('https://www.clubfindr.com/register/login/apple');
					const authorizationUrl = `https://appleid.apple.com/auth/authorize?client_id=${appleClientId}&response_type=code&redirect_uri=${redirectUri}&scope=name%20email&response_mode=form_post`;
					window.location.href = authorizationUrl;
				} else if (musicService === 'Deezer') {
					const redirectUri = encodeURIComponent('https://www.clubfindr.com/register/login/deezer');
					const authorizationUrl = `https://connect.deezer.com/oauth/auth.php?app_id=${deezerAppId}&redirect_uri=${redirectUri}&perms=basic_access,email,offline_access`;
					window.location.href = authorizationUrl;
				}
			} else {
				alert(result.message || 'Registration failed. Please try again.');
			}
		} catch (error) {
			console.error('Error during registration:', error);
			alert('Registration failed. Please try again later.');
		} finally {
			isSubmitting = false;
		}
	}
	function validateCity(cityName: string): boolean {
		if (!cityName) {
			cityError = 'Please select a city';
			return false;
		}

		const cityExists = citiesData.cities.some(
			(city) => city.name.toLowerCase() === cityName.toLowerCase()
		);

		if (!cityExists) {
			cityError = 'Invalid city selected';
			return false;
		}

		cityError = '';
		return true;
	}

	async function submitForm() {
			const recaptchaElement = document.querySelector('[name="g-recaptcha-response"]');
			const recaptchaResponse = (recaptchaElement as HTMLTextAreaElement | null)?.value ?? '';

		const res = await fetch('/api/verify-captcha', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ recaptchaResponse })
		});

		if (res.ok) {
			isVerified = true;
		} else {
			alert('Please complete the reCAPTCHA verification.');
		}
	}
</script>

<svelte:head>
	<title>Register Your Bar - Clubfindr</title>
	<meta
		name="description"
		content="Register your bar or club with Clubfindr and connect with music lovers in your area."
	/>
</svelte:head>

<main class="registration-container">
	{#if !isVerified}
		<div class="overlay">
			<div class="recaptcha-container">
				<h2>Please complete the reCAPTCHA</h2>
				<!-- reCAPTCHA widget -->
				<div class="g-recaptcha" data-sitekey={siteKey} />
				<button on:click={submitForm}>Close</button>
			</div>
		</div>
	{/if}

	<h1>Bar Registration & Music Integration</h1>

	<form on:submit={register} class="registration-form">
		<div class="form-group">
			<label for="businessName">
				Business Name:
				<input
					type="text"
					id="businessName"
					bind:value={businessName}
					on:input={() => {
						validateBusinessName(businessName);
						fetchPredictions();
					}}
					class:error={businessNameError}
					required
				/>
				{#if businessNameError}
					<span class="error-message">{businessNameError}</span>
				{/if}
			</label>
			{#if predictions.length > 0}
				<ul class="predictions-list">
					{#each predictions as prediction}
						<li>
							<button type="button" on:click={() => selectPlace(prediction)}>
								{prediction}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="form-group">
			<label for="contactPerson">
				Contact Person:
				<input type="text" id="contactPerson" bind:value={contactPerson} required />
			</label>
		</div>

		<div class="form-group">
			<label for="email">
				Email:
				<input
					type="email"
					id="email"
					bind:value={email}
					on:input={() => validateEmail(email)}
					class:error={emailError}
					required
				/>
				{#if emailError}
					<span class="error-message">{emailError}</span>
				{/if}
			</label>
		</div>

		<div class="form-group">
			<label for="phone">
				Phone:
				<input
					type="tel"
					id="phone"
					bind:value={phone}
					on:input={() => validatePhone(phone)}
					class:error={phoneError}
					required
				/>
				{#if phoneError}
					<span class="error-message">{phoneError}</span>
				{/if}
			</label>
		</div>

		<div class="form-group">
			<label for="address">
				Street Address:
				<input type="text" id="address" bind:value={address} required />
			</label>
		</div>

		<div class="form-group">
			<label for="postcode">
				Bar Postcode:
				<input type="text" id="postcode" bind:value={postcode} required />
			</label>
		</div>
		<div class="form-group">
			<label for="citySelect">
				City:
				<select
					id="citySelect"
					bind:value={selectedCityName}
					on:change={() => {
						selectedCityDetails = getCityDetails(selectedCityName);
						validateCity(selectedCityName);
					}}
					class:error={cityError}
					required
				>
					<option value="">Select a city</option>
					{#if citiesData.cities && citiesData.cities.length > 0}
						{#each citiesData.cities as city}
							<option value={city.name}>{city.name}</option>
						{/each}
					{/if}
				</select>
			</label>
			{#if cityError}
				<span class="error-message">{cityError}</span>
			{/if}
		</div>
		<div class="form-group">
			<label for="website">
				Website/Social Media:
				<input type="url" id="website" bind:value={website} placeholder="https://" />
			</label>
		</div>

		<div class="form-group">
			<label for="password">
				Password:
				<input
					type="password"
					id="password"
					bind:value={password}
					on:input={validatePasswords}
					class:error={passwordErrors.length > 0}
					required
				/>
			</label>
		</div>

		<div class="form-group">
			<label for="confirmPassword">
				Confirm Password:
				<input
					type="password"
					id="confirmPassword"
					bind:value={confirmPassword}
					on:input={validatePasswords}
					class:error={passwordErrors.length > 0}
					required
				/>
			</label>
			{#if passwordErrors.length > 0}
				<div class="password-requirements">
					<p>Password Requirements:</p>
					<ul>
						{#each passwordErrors as error}
							<li class="error-message">{error}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		<div class="form-group">
			<label for="musicService">
				Preferred Music Service:
				<select id="musicService" bind:value={musicService} required>
					<option value="">Select a music service</option>
					<option value="Spotify">Spotify</option>
					<option value="Apple Music">Apple Music</option>
					<option value="Soundcloud">Soundcloud</option>
					<option value="Other">Other</option>
				</select>
			</label>
		</div>

		<div class="form-group">
			<label for="musicServiceEmail">
				Email associated with Music Service:
				<input
					type="email"
					id="musicServiceEmail"
					bind:value={musicServiceEmail}
					on:input={() => validateEmail(musicServiceEmail)}
					class:error={emailError}
					required
				/>
				{#if emailError}
					<span class="error-message">{emailError}</span>
				{/if}
			</label>
		</div>

		<div class="consent-group">
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={agreeToTerms} required />
				I agree to the
				<a href="/policies/terms-and-conditions" target="_blank">Terms and Conditions</a>
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={agreeToPrivacyPolicy} required />
				I consent to the processing of my personal data in accordance with the
				<a href="/policies/privacy-policy" target="_blank">Privacy Policy</a>
			</label>
		</div>

		<button type="submit" class="submit-button" disabled={isSubmitting}>
			{isSubmitting ? 'Registering...' : 'Register'}
		</button>
	</form>
</main>

<style>
	.registration-container {
		max-width: 800px;
		margin: 2rem auto;
		padding: 2rem;
		background-color: rgba(0, 0, 0, 0.7);
		border-radius: 10px;
	}

	h1 {
		text-align: center;
		color: white;
		margin-bottom: 2rem;
	}

	.registration-form {
		display: grid;
		gap: 1.5rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	label {
		color: white;
		font-size: 1rem;
	}

	input,
	select {
		padding: 0.75rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 1rem;
		background-color: white;
		color: black;
		width: 100%;
	}

	input.error,
	select.error {
		border-color: #ff4444;
	}

	.error-message {
		color: #ff4444;
		font-size: 0.875rem;
		margin-top: 0.25rem;
	}

	.predictions-list {
		list-style: none;
		padding: 0;
		margin: 0;
		background-color: white;
		border-radius: 4px;
		max-height: 200px;
		overflow-y: auto;
	}

	.predictions-list button {
		width: 100%;
		padding: 0.5rem;
		text-align: left;
		border: none;
		background: none;
		cursor: pointer;
	}

	.predictions-list button:hover {
		background-color: #f0f0f0;
	}

	.consent-group {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.checkbox-label input[type='checkbox'] {
		width: auto;
	}

	.submit-button {
		padding: 1rem;
		background-color: #4caf50;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		transition: background-color 0.3s;
	}

	.submit-button:hover:not(:disabled) {
		background-color: #45a049;
	}

	.submit-button:disabled {
		background-color: #cccccc;
		cursor: not-allowed;
	}

	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.recaptcha-container {
		background: white;
		color: #333;
		padding: 2rem;
		border-radius: 8px;
		text-align: center;
		min-width: 304px; /* Minimum width to accommodate reCAPTCHA widget */
	}

	.password-requirements {
		background-color: rgba(255, 255, 255, 0.1);
		padding: 1rem;
		border-radius: 4px;
		margin-top: 0.5rem;
	}

	.password-requirements p {
		color: white;
		margin: 0 0 0.5rem 0;
	}

	.password-requirements ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	a {
		color: #4caf50;
		text-decoration: underline;
	}

	a:hover {
		color: #45a049;
	}
	select {
		padding: 0.75rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 1rem;
		background-color: white;
		color: black;
		width: 100%;
		appearance: auto; /* Shows the dropdown arrow */
	}

	select:focus {
		outline: none;
		border-color: #4caf50;
	}

	select:invalid {
		color: #757575;
	}

	@media (max-width: 600px) {
		.registration-container {
			padding: 1rem;
			margin: 1rem;
		}
	}
</style>
