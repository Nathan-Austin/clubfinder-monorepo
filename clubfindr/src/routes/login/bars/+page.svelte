<!-- login/bars/+page.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { validateEmail } from '$lib/passwordUtils';

	let email = '';
	let password = '';
	let emailError = '';
	let loginError = '';
	let isSubmitting = false;
	const dispatch = createEventDispatcher();

	function validateForm() {
		emailError = '';
		loginError = '';

		if (!validateEmail(email)) {
			emailError = 'Please enter a valid email address';
			return false;
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
			const response = await fetch('/login/bars', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ email, password })
			});

			const result = await response.json();

			if (result.success) {
				// Check if Spotify authentication is needed
				if (result.needsSpotifyAuth && result.authUrl) {
					console.log('Bar needs Spotify authentication, redirecting to Spotify OAuth');
					// Redirect directly to Spotify auth flow from here
					window.location.href = result.authUrl;
				} else {
					// Normal login success flow
					dispatch('loginSuccess');
					// Use the redirect URL from the response
					window.location.href = result.redirectUrl;
				}
			} else {
				// Handle redirect for incorrect login page
				if (result.redirectUrl) {
					window.location.href = result.redirectUrl;
				} else {
					loginError = result.message || 'Invalid email or password';
				}
			}
		} catch (error) {
			console.error('Login error:', error);
			loginError = 'An error occurred during login. Please try again.';
		} finally {
			isSubmitting = false;
		}
	}

	onMount(() => {
		// Check for existing bar login
		const barId = document.cookie.split('; ').find((row) => row.startsWith('barId='));

		if (barId) {
			goto('/bars');
		}
	});
</script>

<svelte:head>
	<title>Bar/Club Login - Clubfindr</title>
	<meta
		name="description"
		content="Login to your bar or club account on Clubfindr. Manage your venue's profile and connect with music lovers in your area."
	/>
	<meta
		name="keywords"
		content="Clubfindr bar login, club login, venue management, nightlife business"
	/>
	<meta name="author" content="Clubfindr Team" />
	<meta property="og:title" content="Bar/Club Login - Clubfindr" />
	<meta property="og:description" content="Login to manage your venue on Clubfindr." />
	<meta property="og:image" content="/clubfindr.png" />
	<meta property="og:url" content="https://clubfindr.com/login/bars" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<main class="login-container">
	<h1>Welcome Back to Clubfindr</h1>

	{#if loginError}
		<div class="error-message">
			{loginError}
		</div>
	{/if}

	<form on:submit={handleLogin} class="login-form">
		<div class="form-group">
			<label for="email">Email</label>
			<input
				type="email"
				id="email"
				bind:value={email}
				on:input={() => (emailError = '')}
				class:error={emailError}
				placeholder="Enter your email"
				required
			/>
			{#if emailError}
				<span class="error-message">{emailError}</span>
			{/if}
		</div>

		<div class="form-group">
			<label for="password">Password</label>
			<input
				type="password"
				id="password"
				bind:value={password}
				placeholder="Enter your password"
				required
			/>
		</div>

		<div class="form-actions">
			<a href="/password-reset" class="forgot-password">Forgot Password?</a>
		</div>

		<button type="submit" class="login-button" disabled={isSubmitting}>
			{isSubmitting ? 'Logging in...' : 'Login'}
		</button>
	</form>

	<div class="register-link">
		<p>Don't have an account? <a href="/register/promoter">Register Now</a></p>
	</div>
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

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
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
		transition: border-color 0.3s, background-color 0.3s;
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

	.form-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: -0.5rem;
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

	.register-link {
		text-align: center;
		margin-top: 1.5rem;
		font-size: 0.9rem;
	}

	.register-link a {
		color: #4caf50;
		text-decoration: none;
	}

	.register-link a:hover {
		text-decoration: underline;
	}

	@media (max-width: 600px) {
		.login-container {
			margin: 1rem;
			padding: 1rem;
		}

		h1 {
			font-size: 1.5rem;
		}
	}
</style>
