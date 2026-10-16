<!-- /register/promoter/confirm/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let email = $state('');
	let confirmationCode = $state('');
	let errorMessage = $state('');
	let loading = $state(false);
	let attempts = $state(0);
	let resendCooldown = $state(0);
	let canResend = $state(true);
	let resendTimer: ReturnType<typeof setInterval> | null = null;

	// Automatically get the email from the query parameter if available
	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		email = params.get('email') || '';
	});
	async function confirm(event: Event) {
		event.preventDefault();
		loading = true;
		errorMessage = '';

		try {
			// Corrected the endpoint to verify the confirmation code
			const response = await fetch('/register/promoter/confirm', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ email, confirmationCode })
			});

			const result = await response.json();

			if (result.success) {
				// Redirect to /bars if the confirmation is successful
				goto('/promoter-home', { replaceState: true });
			} else {
				attempts++;
				if (attempts >= 3) {
					errorMessage = 'Maximum number of attempts reached. Please try again later.';
				} else {
					errorMessage =
						result.error || 'Confirmation failed. Please check the code and try again.';
				}
			}
		} catch (error) {
			console.log(error);
			errorMessage = 'An error occurred while confirming your email. Please try again later.';
		} finally {
			loading = false;
		}
	}

	async function resendCode() {
		if (!canResend || resendCooldown > 0 || attempts >= 3) return;

		loading = true;
		errorMessage = '';
		try {
			const response = await fetch('/register/promoter/confirm/resend-code', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ email })
			});

			const result = await response.json();

			if (result.success) {
				canResend = false;
				resendCooldown = 120; // 2 minutes cooldown
				errorMessage = 'Confirmation code resent. Please check your email.';

				// Start cooldown timer
				resendTimer = setInterval(() => {
					resendCooldown--;
					if (resendCooldown <= 0) {
						canResend = true;
						clearInterval(resendTimer as ReturnType<typeof setInterval>);
						resendTimer = null;
					}
				}, 1000);
			} else {
				errorMessage =
					result.error || 'Failed to resend the confirmation code. Please try again later.';
			}
		} catch (error) {
			console.log(error);
			errorMessage =
				'An error occurred while resending the confirmation code. Please try again later.';
		} finally {
			loading = false;
		}
	}
</script>

<h1>Confirm Your Email</h1>

<form onsubmit={confirm} aria-busy={loading}>
	<label for="email">Email:</label>
	<input type="email" id="email" bind:value={email} required placeholder="Enter your email" />

	<label for="confirmation-code">Confirmation Code:</label>
	<input
		type="text"
		id="confirmation-code"
		bind:value={confirmationCode}
		required
		placeholder="Enter the confirmation code"
		color="Black"
		maxlength="6"
	/>

	{#if errorMessage}
		<p role="alert" style="color: red;">{errorMessage}</p>
	{/if}

	<button type="submit" disabled={loading || attempts >= 3}>
		{#if loading}
			Confirming...
		{:else}
			Confirm
		{/if}
	</button>

	{#if attempts < 3 && canResend}
		<p>
			<!-- svelte-ignore a11y_invalid_attribute -->
			Didn’t receive the code?
			<a
				href="#"
				onclick={(e) => {
					e.preventDefault();
					resendCode();
				}}>Resend Code</a
			>
		</p>
	{/if}

	{#if resendCooldown > 0}
		<p>
			Please wait {Math.ceil(resendCooldown / 60)}:{String(resendCooldown % 60).padStart(2, '0')} minutes
			before resending.
		</p>
	{/if}
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		max-width: 400px;
		margin: auto;
		background-color: #f9f9f9;
		padding: 20px;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		color: #333;
	}

	label {
		margin-bottom: 5px;
		font-size: 16px;
		color: #333;
	}

	input {
		padding: 10px;
		margin-bottom: 15px;
		font-size: 16px;
		border: 1px solid #ccc;
		border-radius: 4px;
		width: 100%;
		box-sizing: border-box;
	}

	button {
		padding: 10px 15px;
		background-color: #007bff;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 16px;
		cursor: pointer;
	}

	button[disabled] {
		background-color: #ccc;
		cursor: not-allowed;
	}

	button:hover:not([disabled]) {
		background-color: #0056b3;
	}

	[aria-busy='true'] {
		opacity: 0.6;
		pointer-events: none;
	}
</style>
