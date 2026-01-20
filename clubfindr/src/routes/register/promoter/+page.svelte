<!-- /register/promoter/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { CitiesData, City } from '$lib/types/city';
	const siteKey = import.meta.env.VITE_reCAPTCHA_SITE_KEY;
	let isVerified = false;
	let citiesData: CitiesData = { cities: [] };
	let selectedCityName = '';
	let selectedCity: City | null = null;
	let businessName = '';
	let contactPerson = '';
	let email = '';
	let phone = '';
	let address = '';
	let postcode = '';
	let website = '';
	let agreeToTerms = false;
	let agreeToPrivacyPolicy = false;
	let password = '';
	let confirmPassword = '';
	let passwordError = '';

	// Function to validate passwords
	function validatePasswords() {
		if (password !== confirmPassword) {
			passwordError = 'Passwords do not match.';
		} else {
			passwordError = '';
		}
	}

	// Load cities data and Google Maps Places library
	onMount(async () => {
		const response = await fetch('/lib/cities.json');
		citiesData = await response.json();

		// Default to the first city in the list
		if (citiesData.cities.length > 0) {
			selectedCityName = citiesData.cities[0].name;
			selectedCity = getCityDetails(selectedCityName);
		}

		// Load reCAPTCHA API asynchronously
		const recaptchaScript = document.createElement('script');
		recaptchaScript.src = 'https://www.google.com/recaptcha/api.js';
		recaptchaScript.async = true;
		recaptchaScript.defer = true;
		document.head.appendChild(recaptchaScript);
	});

	// Function to get city details from cities.json
	function getCityDetails(cityName: string): City | null {
		return (
			citiesData.cities.find((city) => city.name.toLowerCase() === cityName.toLowerCase()) || null
		);
	}

	// Function to handle form submission
	async function register(event: Event) {
		event.preventDefault();

		// Check if the user has agreed to the terms and privacy policy
		if (!agreeToTerms || !agreeToPrivacyPolicy) {
			alert('You must agree to the Terms and Conditions and Privacy Policy to register.');
			return; // Stop form submission if they haven't agreed
		}

		validatePasswords(); // Ensure passwords are validated before submission

		if (passwordError) {
			return; // Stop form submission if there's a password error
		}

		try {
			const registerResponse = await fetch('/register/promoter', {
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
					password
				})
			});
			const responseData = await registerResponse.json();

			// Check if registration was successful
			if (responseData.success) {
				// Redirect to the confirmation page
				window.location.href = responseData.redirectUrl;
			} else {
				alert('Registration failed. Please try again.');
			}
		} catch (error) {
			console.error('Error during registration:', error);
			alert('Registration failed.');
		}
	}

	async function submitForm() {
		const recaptchaElement = document.querySelector('[name="g-recaptcha-response"]');
		const recaptchaResponse = (recaptchaElement as HTMLTextAreaElement | null)?.value ?? '';

		// Send reCAPTCHA token to your server
		const res = await fetch('/api/verify-captcha', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ recaptchaResponse })
		});

		if (res.ok) {
			console.log('reCAPTCHA validation succeeded');
			isVerified = true;
		} else {
			console.error('reCAPTCHA validation failed');
		}
	}
</script>

<h1>Promoter Registration</h1>

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

<form on:submit={register}>
	<label>
		Business Name:
		<input type="text" bind:value={businessName} required />
	</label>

	<label>
		Contact Person:
		<input type="text" bind:value={contactPerson} required />
	</label>

	<label>
		Email:
		<input type="email" bind:value={email} required />
	</label>

	<label>
		Phone:
		<input type="tel" bind:value={phone} required />
	</label>

	<label>
		Street Address:
		<input type="text" bind:value={address} required />
	</label>

	<label>
		Postcode:
		<input type="text" bind:value={postcode} required />
	</label>

	<label>
		City:
		<select
			bind:value={selectedCityName}
			on:change={() => (selectedCity = getCityDetails(selectedCityName))}
			required
		>
			{#each citiesData.cities as city}
				<option value={city.name}>{city.name}</option>
			{/each}
		</select>
	</label>

	{#if selectedCity}
		<p>Region: {selectedCity.region}</p>
	{/if}

	<label>
		Website/Social Media:
		<input type="url" bind:value={website} />
	</label>

	<label>
		Password:
		<input type="password" bind:value={password} required />
	</label>

	<label>
		Confirm Password:
		<input type="password" bind:value={confirmPassword} required on:input={validatePasswords} />
	</label>

	{#if passwordError}
		<p style="color: red;">{passwordError}</p>
	{/if}

	<!-- Terms and Privacy Policy Consent -->
	<label>
		<input type="checkbox" bind:checked={agreeToTerms} required />
		I agree to the <a href="/policies/terms-and-conditions" target="_blank">Terms and Conditions</a>
	</label>

	<label>
		<input type="checkbox" bind:checked={agreeToPrivacyPolicy} required />
		I consent to the processing of my personal data in accordance with the
		<a href="/policies/privacy-policy" target="_blank">Privacy Policy</a>
	</label>

	<button type="submit">Register</button>
</form>

<style>
	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	.recaptcha-container {
		background: white;
		padding: 20px;
		border-radius: 8px;
		text-align: center;
		color: #333;
	}
	form {
		display: flex;
		flex-direction: column;
		max-width: 400px;
		margin: auto;
	}

	label {
		display: flex;
		flex-direction: column;
		font-size: 16px;
		color: white;
		margin-bottom: 15px;
	}

	input,
	select,
	button {
		padding: 8px;
		margin-top: 4px;
		font-size: 16px;
		color: black;
		background-color: white;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	input[type='text'],
	input[type='email'],
	input[type='tel'],
	input[type='url'],
	select {
		width: 100%;
		box-sizing: border-box;
	}
	input[type='checkbox'] {
		margin-right: 10px;
	}

	button {
		margin-top: 20px;
		padding: 10px;
		background-color: #007bff;
		color: white;
		border: none;
		border-radius: 5px;
		cursor: pointer;
	}

	button:hover {
		background-color: #0056b3;
	}

	a {
		color: #1a73e8;
		text-decoration: underline;
	}

	a:hover {
		color: #004aad;
	}
</style>
