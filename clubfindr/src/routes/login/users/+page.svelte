<script lang="ts">
	import { PUBLIC_FACEBOOK_APP_ID, PUBLIC_GOOGLE_OAUTH_CLIENT_ID } from '$env/static/public';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { validateEmail } from '$lib/passwordUtils';
	import type { FacebookLoginResponse } from '../../../../types/facebook';
	import PasswordToggle from '$lib/components/PasswordToggle.svelte';

	const client_id = PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
	const facebookAppId = PUBLIC_FACEBOOK_APP_ID;

	let email = $state('');
	let password = $state('');
	let fullName = $state(''); // New field
	let spotifyEmail = $state(''); // New field
	let emailError = $state('');
	let loginError = $state('');
	let isSubmitting = $state(false);
	let isNewUser = $state(false); // New state for registration mode
	let showSpotifyEmailInfo = $state(false); // State for Spotify email info tooltip

	function toggleSpotifyEmailInfo(event: Event): void {
		event.stopPropagation();
		showSpotifyEmailInfo = !showSpotifyEmailInfo;
	}

	function calculatePasswordStrength(pass: string): number {
		if (!pass) return 0;

		let score = 0;
		// Length check
		score += Math.min(pass.length * 4, 25);

		// Character variety checks
		if (/[A-Z]/.test(pass)) score += 15;
		if (/[a-z]/.test(pass)) score += 10;
		if (/[0-9]/.test(pass)) score += 10;
		if (/[^A-Za-z0-9]/.test(pass)) score += 20;

		// Complexity bonus
		if (
			/[A-Z]/.test(pass) &&
			/[a-z]/.test(pass) &&
			/[0-9]/.test(pass) &&
			/[^A-Za-z0-9]/.test(pass)
		) {
			score += 20;
		}

		return Math.min(score, 100);
	}

	function getPasswordStrengthColor(pass: string): string {
		const strength = calculatePasswordStrength(pass);
		if (strength < 30) return '#FF4444'; // Weak - Red
		if (strength < 60) return '#FFAA00'; // Medium - Orange
		if (strength < 80) return '#AACC00'; // Good - Light Green
		return '#00CC00'; // Strong - Green
	}

	function getPasswordStrengthText(pass: string): string {
		const strength = calculatePasswordStrength(pass);
		if (strength < 30) return 'Weak';
		if (strength < 60) return 'Medium';
		if (strength < 80) return 'Good';
		return 'Strong';
	}

	function validateForm(): boolean {
		emailError = '';
		loginError = '';

		if (!validateEmail(email)) {
			emailError = 'Please enter a valid email address';
			return false;
		}

		if (isNewUser) {
			if (!fullName) {
				loginError = 'Please enter your full name';
				return false;
			}
			// Optional: only validated when something was typed
			if (spotifyEmail.trim() && !validateEmail(spotifyEmail.trim())) {
				loginError = 'Please enter a valid Spotify email address, or leave the field empty';
				return false;
			}
			const commonPatterns = [
				'123456',
				'password',
				'qwerty',
				'abc123',
				'admin123',
				'welcome',
				'letmein',
				'monkey'
			];
			if (commonPatterns.some((pattern) => password.toLowerCase().includes(pattern))) {
				loginError =
					'Password contains common patterns that are easily guessed. Please choose a more unique password.';
				return false;
			}
			// Password strength validation for new users
			if (calculatePasswordStrength(password) < 60) {
				loginError = 'Please choose a stronger password';
				return false;
			}
		}

		return true;
	}

	async function handleLogin(event: Event) {
		event.preventDefault();
		if (isSubmitting) return;

		if (!validateForm()) return;

		isSubmitting = true;
		loginError = '';

		try {
			const response = await fetch('/login/users', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email,
					password,
					provider: 'local',
					isNewUser,
					fullName: isNewUser ? fullName : undefined,
					spotifyEmail: isNewUser && spotifyEmail.trim() ? spotifyEmail.trim() : undefined
				})
			});

			const result = await response.json();

			if (result.success) {
				window.location.href = '/users-home';
			} else {
				loginError = result.message || 'Login failed';
			}
		} catch (error) {
			console.error('Login error:', error);
			loginError = 'An error occurred during login. Please try again.';
		} finally {
			isSubmitting = false;
		}
	}

	// Keep your existing Google Sign In handler
	async function handleGoogleSignIn(response: { credential: string }) {
		try {
			const res = await fetch('/login/users', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ token: response.credential, provider: 'google' })
			});

			const data = await res.json();

			if (data.success) {
				window.location.href = '/users-home';
			} else {
				loginError = data.message || 'Google login failed';
			}
		} catch (error) {
			console.error('Google sign-in error:', error);
			loginError = 'An error occurred during Google sign-in. Please try again.';
		}
	}

	// Keep your existing Facebook login handler
	async function triggerFacebookLogin() {
		if (typeof FB === 'undefined') {
			loginError = 'Facebook SDK not loaded yet.';
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(FB as any).login(
			(response: FacebookLoginResponse) => {
				if (response.status === 'connected' && response.authResponse) {
					const accessToken = response.authResponse.accessToken;

					fetch('/login/users', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({ token: accessToken, provider: 'facebook' })
					})
						.then(async (res) => {
							const data = await res.json();

							if (data.success) {
								window.location.href = '/users-home';
							} else {
								loginError = data.message || 'Facebook login failed';
							}
						})
						.catch((error) => {
							console.error('Facebook sign-in error:', error);
							loginError = 'An error occurred during Facebook sign-in. Please try again.';
						});
				} else {
					loginError = 'Facebook login was cancelled or not authorized.';
				}
			},
			{ scope: 'public_profile,email' }
		);
	}

	onMount(() => {
		const isLoggedIn = document.cookie.split('; ').find((row) => row.startsWith('isLoggedIn='));

		if (isLoggedIn) {
			goto('/users-home');
		}

		// Load Google Sign-In
		const script = document.createElement('script');
		script.src = 'https://accounts.google.com/gsi/client';
		script.async = true;
		script.defer = true;
		document.head.appendChild(script);

		window.handleGoogleSignIn = handleGoogleSignIn;

		window.onload = () => {
			if (window.google && window.google.accounts) {
				window.google.accounts.id.initialize({
					client_id: client_id,
					callback: handleGoogleSignIn
				});

				window.google.accounts.id.prompt();
			}
		};

		// Load Facebook SDK
		window.fbAsyncInit = function () {
			FB.init({
				appId: facebookAppId,
				cookie: true,
				xfbml: true,
				version: 'v21.0'
			});
			FB.AppEvents.logPageView();
		};

		const facebookScript = document.createElement('script');
		facebookScript.src = 'https://connect.facebook.net/en_US/sdk.js';
		facebookScript.async = true;
		document.head.appendChild(facebookScript);
	});
</script>

<svelte:head>
	<title>Login to Clubfindr - Discover Clubs and Bars Based on Music You Love</title>
	<meta
		name="description"
		content="Login to Clubfindr, the platform that helps you find clubs and bars based on your favorite music styles and artists. Discover new places, meet people, and explore the nightlife in your city."
	/>
</svelte:head>

<main class="login-container">
	<h1>Welcome to Clubfindr</h1>

	{#if loginError}
		<div class="error-message">
			{loginError}
		</div>
	{/if}

	<div class="oauth-buttons">
		<div
			id="g_id_onload"
			data-client_id={client_id}
			data-callback="handleGoogleSignIn"
			data-auto_prompt="false"
		></div>
		<div class="g_id_signin" data-type="standard"></div>

		<button class="facebook-login-button" onclick={triggerFacebookLogin}>
			Login with Facebook
		</button>
	</div>

	<div class="divider">
		<span>or</span>
	</div>

	<form onsubmit={handleLogin} class="login-form">
		<div class="form-group">
			<label for="email">Email</label>
			<input
				type="email"
				id="email"
				bind:value={email}
				oninput={() => (emailError = '')}
				class:error={emailError}
				placeholder="Enter your email"
				required
			/>
			{#if emailError}
				<span class="error-message">{emailError}</span>
			{/if}
		</div>

		<div class="form-group">
			<label for="password">{isNewUser ? 'Choose a Password' : 'Password'}</label>
			<PasswordToggle>
				<input
					type="password"
					id="password"
					bind:value={password}
					placeholder={isNewUser ? 'Create a secure password' : 'Enter your password'}
					required
				/>
			</PasswordToggle>
			{#if isNewUser && password}
				<div class="password-strength-meter">
					<div class="strength-bar">
						<div
							class="strength-indicator"
							style="width: {calculatePasswordStrength(
								password
							)}%; background-color: {getPasswordStrengthColor(password)};"
						></div>
					</div>
					<span class="strength-text" style="color: {getPasswordStrengthColor(password)};">
						{getPasswordStrengthText(password)}
					</span>
				</div>
				<ul class="password-requirements">
					<li class={password.length >= 8 ? 'met' : 'unmet'}>At least 8 characters</li>
					<li class={/[A-Z]/.test(password) ? 'met' : 'unmet'}>Contains uppercase letter</li>
					<li class={/[a-z]/.test(password) ? 'met' : 'unmet'}>Contains lowercase letter</li>
					<li class={/[0-9]/.test(password) ? 'met' : 'unmet'}>Contains number</li>
					<li class={/[^A-Za-z0-9]/.test(password) ? 'met' : 'unmet'}>
						Contains special character
					</li>
				</ul>
			{/if}
		</div>

		<!-- New User Registration Fields -->
		{#if isNewUser}
			<div class="form-group">
				<label for="fullName">Full Name</label>
				<input
					type="text"
					id="fullName"
					bind:value={fullName}
					placeholder="Enter your full name"
					required
				/>
			</div>

			<div class="form-group">
				<label for="spotifyEmail">
					Spotify Email (optional)
					<button type="button" class="info-icon" onclick={toggleSpotifyEmailInfo}>?</button>
				</label>
				<input
					type="email"
					id="spotifyEmail"
					bind:value={spotifyEmail}
					placeholder="Only if you want to connect Spotify"
				/>
				{#if showSpotifyEmailInfo}
					<div class="info-tooltip">
						<button type="button" class="close-tooltip" onclick={toggleSpotifyEmailInfo}>×</button>
						<h4>Why do we ask for this?</h4>
						<p>
							You can use Clubfindr without Spotify: pick your favourite artists and genres in your
							taste profile instead. If you do want to connect Spotify later, this email is used to
							add you to our Spotify application.
						</p>

						<h4>Where to find your Spotify email?</h4>
						<ol>
							<li>
								Log in to <a
									href="https://www.spotify.com/account"
									target="_blank"
									rel="noopener noreferrer">Spotify Account page</a
								>
							</li>
							<li>Look for "Email" in your profile information</li>
							<li>Use this email address in this form</li>
						</ol>
						<p><strong>Note:</strong> This must be the same email you use to log in to Spotify.</p>
					</div>
				{/if}
			</div>
		{/if}

		<div class="form-actions">
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={isNewUser} />
				I'm a new user
			</label>
			<a href="/password-reset" class="forgot-password">Forgot Password?</a>
		</div>

		{#if isNewUser}
			<div class="data-protection-notice">
				<p>We value your privacy. By registering, you agree to our:</p>
				<ul>
					<li>Collection of your name and email for account management</li>
					<li>Integration with Spotify to provide personalized recommendations</li>
					<li>Processing of your music preferences to find suitable venues</li>
				</ul>
				<p>
					See our <a href="/policies/privacy-policy" target="_blank">Privacy Policy</a> for more details.
				</p>
			</div>
		{/if}

		<button type="submit" class="login-button" disabled={isSubmitting}>
			{isSubmitting ? 'Processing...' : isNewUser ? 'Register' : 'Login'}
		</button>
	</form>
</main>

<style>
	.login-container {
		max-width: 500px;
		margin: 2rem auto;
		padding: 2rem;
		background-color: rgba(0, 0, 0, 0.7);
		border-radius: 10px;
		color: white;
	}

	h1 {
		text-align: center;
		margin-bottom: 2rem;
		font-size: 1.8rem;
	}

	.oauth-buttons {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.facebook-login-button {
		background-color: #3b5998;
		color: white;
		border: none;
		padding: 10px 20px;
		border-radius: 4px;
		cursor: pointer;
		width: 100%;
		font-size: 1rem;
	}

	.facebook-login-button:hover {
		background-color: #2d4373;
	}

	.divider {
		display: flex;
		align-items: center;
		text-align: center;
		margin: 1.5rem 0;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
	}

	.divider span {
		padding: 0 1rem;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.9rem;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		position: relative;
	}

	.form-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	label {
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.9);
	}

	input {
		padding: 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		background-color: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: 1rem;
		transition:
			border-color 0.3s,
			background-color 0.3s;
	}

	input:focus {
		outline: none;
		border-color: #4caf50;
		background-color: rgba(255, 255, 255, 0.15);
	}

	input.error {
		border-color: #ff4444;
	}

	.error-message {
		color: #ff4444;
		font-size: 0.875rem;
		margin-top: 0.25rem;
	}

	.forgot-password {
		color: #4caf50;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.forgot-password:hover {
		text-decoration: underline;
	}

	.login-button {
		padding: 0.75rem;
		background-color: #4caf50;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		transition: background-color 0.3s;
	}

	.login-button:hover:not(:disabled) {
		background-color: #45a049;
	}

	.login-button:disabled {
		background-color: rgba(76, 175, 80, 0.5);
		cursor: not-allowed;
	}

	/* Password strength meter */
	.password-strength-meter {
		margin-top: 0.5rem;
	}

	.strength-bar {
		height: 5px;
		background-color: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		margin-bottom: 0.25rem;
	}

	.strength-indicator {
		height: 100%;
		border-radius: 2px;
		transition:
			width 0.3s,
			background-color 0.3s;
	}

	.strength-text {
		font-size: 0.8rem;
	}

	.password-requirements {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0;
		font-size: 0.8rem;
	}

	.password-requirements li {
		margin-bottom: 0.25rem;
		position: relative;
		padding-left: 1.5rem;
	}

	.password-requirements li:before {
		content: '✘';
		position: absolute;
		left: 0;
		color: #ff4444;
	}

	.password-requirements li.met:before {
		content: '✓';
		color: #4caf50;
	}

	/* Data protection notice */
	.data-protection-notice {
		background-color: rgba(0, 0, 0, 0.3);
		border-radius: 4px;
		padding: 1rem;
		margin: 1rem 0;
		font-size: 0.85rem;
		border-left: 3px solid #4caf50;
	}

	.data-protection-notice p {
		margin: 0.5rem 0;
	}

	.data-protection-notice ul {
		padding-left: 1.5rem;
		margin: 0.5rem 0;
	}

	.data-protection-notice a {
		color: #4caf50;
		text-decoration: underline;
	}

	/* Info icon and tooltip */
	.info-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background-color: rgba(255, 255, 255, 0.2);
		color: white;
		font-size: 12px;
		margin-left: 8px;
		cursor: pointer;
		transition: background-color 0.2s;
		border: none;
	}

	.info-icon:hover {
		background-color: rgba(255, 255, 255, 0.4);
	}

	.info-tooltip {
		position: relative;
		margin-top: 8px;
		background-color: rgba(0, 0, 0, 0.8);
		border-radius: 4px;
		padding: 12px;
		font-size: 0.85rem;
		border-left: 3px solid #4caf50;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		z-index: 10;
	}

	.close-tooltip {
		position: absolute;
		top: 8px;
		right: 8px;
		font-size: 16px;
		cursor: pointer;
		opacity: 0.7;
		background: none;
		border: none;
		color: white;
		padding: 0;
	}

	.close-tooltip:hover {
		opacity: 1;
	}

	.info-tooltip h4 {
		margin: 0 0 8px 0;
		color: #4caf50;
	}

	.info-tooltip p {
		margin: 0 0 12px 0;
	}

	.info-tooltip ol {
		margin: 8px 0;
		padding-left: 20px;
	}

	.info-tooltip li {
		margin-bottom: 4px;
	}

	.info-tooltip a {
		color: #4caf50;
		text-decoration: underline;
	}
</style>
