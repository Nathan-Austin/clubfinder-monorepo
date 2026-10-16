<script lang="ts">
	import { validateEmail } from '$lib/passwordUtils';
	let email = $state('');
	let emailError = $state('');
	let isSubmitting = $state(false);
	let successMessage = $state('');
	let errorMessage = $state('');

	async function handlePasswordReset(event: Event) {
		event.preventDefault();
		if (isSubmitting) return;

		// Validate email
		if (!validateEmail(email)) {
			emailError = 'Please enter a valid email address';
			return;
		}

		isSubmitting = true;
		errorMessage = '';
		successMessage = '';

		try {
			const response = await fetch('/api/request-password-reset', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ email })
			});

			const result = await response.json();

			if (result.success) {
				successMessage =
					'If an account exists with this email, you will receive password reset instructions shortly.';
				email = ''; // Clear the form
			} else {
				errorMessage = 'Unable to process your request. Please try again later.';
			}
		} catch (error) {
			console.error('Error requesting password reset:', error);
			errorMessage = 'An error occurred. Please try again later.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Reset Password - Clubfindr</title>
	<meta name="description" content="Reset your Clubfindr account password" />
</svelte:head>

<main class="reset-container">
	<h1>Reset Password</h1>

	{#if successMessage}
		<div class="success-message">
			{successMessage}
		</div>
	{/if}

	{#if errorMessage}
		<div class="error-message">
			{errorMessage}
		</div>
	{/if}

	<form onsubmit={handlePasswordReset} class="reset-form">
		<div class="form-group">
			<label for="email">
				Email Address:
				<input
					type="email"
					id="email"
					bind:value={email}
					oninput={() => {
						emailError = '';
						errorMessage = '';
					}}
					class:error={emailError}
					placeholder="Enter your email address"
					required
				/>
				{#if emailError}
					<span class="error-message">{emailError}</span>
				{/if}
			</label>
		</div>

		<button type="submit" class="submit-button" disabled={isSubmitting}>
			{isSubmitting ? 'Sending...' : 'Reset Password'}
		</button>

		<div class="links">
			<a href="/login/users">Back to Login</a>
		</div>
	</form>
</main>

<style>
	.reset-container {
		max-width: 500px;
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

	.reset-form {
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
		color: white;
		font-size: 1rem;
	}

	input {
		padding: 0.75rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 1rem;
		background-color: white;
		color: black;
		width: 100%;
	}

	input.error {
		border-color: #ff4444;
	}

	.error-message {
		color: #ff4444;
		font-size: 0.875rem;
		margin-top: 0.25rem;
	}

	.success-message {
		background-color: rgba(76, 175, 80, 0.1);
		color: #4caf50;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
		text-align: center;
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

	.links {
		text-align: center;
	}

	.links a {
		color: #4caf50;
		text-decoration: none;
	}

	.links a:hover {
		text-decoration: underline;
	}

	@media (max-width: 600px) {
		.reset-container {
			margin: 1rem;
			padding: 1rem;
		}
	}
</style>
