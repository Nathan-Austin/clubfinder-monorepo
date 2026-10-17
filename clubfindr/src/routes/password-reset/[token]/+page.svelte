<script lang="ts">
	import { page } from '$app/state';
	import { validatePassword } from '$lib/passwordUtils';
	import PasswordToggle from '$lib/components/PasswordToggle.svelte';

	let password = $state('');
	let confirmPassword = $state('');
	let passwordErrors: string[] = $state([]);
	let isSubmitting = $state(false);
	let successMessage = $state('');
	let errorMessage = $state('');

	let token = $derived(page.params.token);

	function validatePasswords() {
		const validation = validatePassword(password);
		passwordErrors = validation.errors;

		if (password !== confirmPassword) {
			passwordErrors = [...passwordErrors, 'Passwords do not match'];
		}

		return passwordErrors.length === 0;
	}

	async function handlePasswordUpdate(event: Event) {
		event.preventDefault();
		if (isSubmitting) return;

		if (!validatePasswords()) {
			return;
		}

		isSubmitting = true;
		errorMessage = '';
		successMessage = '';

		try {
			const response = await fetch('/api/reset-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					token,
					newPassword: password
				})
			});

			const result = await response.json();

			if (result.success) {
				successMessage =
					'Password successfully updated. You can now log in with your new password.';
				password = '';
				confirmPassword = '';

				// Redirect to login page after 3 seconds
				setTimeout(() => {
					window.location.href = '/login/users';
				}, 3000);
			} else {
				errorMessage = result.message || 'Failed to update password. Please try again.';
			}
		} catch (error) {
			console.error('Error updating password:', error);
			errorMessage = 'An error occurred. Please try again later.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Set New Password - Clubfindr</title>
	<meta name="description" content="Set a new password for your Clubfindr account" />
</svelte:head>

<main class="reset-container">
	<h1>Set New Password</h1>

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

	<form onsubmit={handlePasswordUpdate} class="reset-form">
		<div class="form-group">
			<label for="password">
				New Password:
				<PasswordToggle>
					<input
						type="password"
						id="password"
						bind:value={password}
						oninput={validatePasswords}
						class:error={passwordErrors.length > 0}
						required
					/>
				</PasswordToggle>
			</label>
		</div>

		<div class="form-group">
			<label for="confirmPassword">
				Confirm New Password:
				<PasswordToggle>
					<input
						type="password"
						id="confirmPassword"
						bind:value={confirmPassword}
						oninput={validatePasswords}
						class:error={passwordErrors.length > 0}
						required
					/>
				</PasswordToggle>
			</label>

			{#if passwordErrors.length > 0}
				<div class="password-requirements">
					<p>Password Requirements:</p>
					<ul>
						{#each passwordErrors as error, i (i)}
							<li class="error-message">{error}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		<button type="submit" class="submit-button" disabled={isSubmitting}>
			{isSubmitting ? 'Updating...' : 'Update Password'}
		</button>
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
	}

	.success-message {
		background-color: rgba(76, 175, 80, 0.1);
		color: #4caf50;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1.5rem;
		text-align: center;
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

	@media (max-width: 600px) {
		.reset-container {
			margin: 1rem;
			padding: 1rem;
		}
	}
</style>
