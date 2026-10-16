<script lang="ts">
	import { onMount } from 'svelte';

	let email = $state('');
	let confirmationCode = $state('');
	let isCodeSent = $state(false);
	let isVerified = $state(false);
	let errorMessage = $state('');
	let isLoading = $state(false);

	// Load state from localStorage on component mount
	onMount(() => {
		// Try to recover state from localStorage if page was refreshed
		const savedEmail = localStorage.getItem('deleteUserEmail');
		const savedCodeSent = localStorage.getItem('deleteUserCodeSent');

		if (savedEmail) {
			email = savedEmail;
		}

		if (savedCodeSent === 'true') {
			isCodeSent = true;
		}

		// Show a notification if we restored state
		if (savedEmail || savedCodeSent) {
			errorMessage = 'Your previous session was restored. You can continue where you left off.';
			setTimeout(() => {
				errorMessage = '';
			}, 5000);
		}
	});

	const sendConfirmationCode = async () => {
		// Reset any existing error message
		errorMessage = '';
		isLoading = true;

		// Save state to localStorage
		localStorage.setItem('deleteUserEmail', email);

		// Send email to backend to trigger confirmation code
		try {
			const response = await fetch('/api/send-delete-confirmation-code', {
				method: 'POST',
				body: JSON.stringify({ email }),
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				isCodeSent = true;
				// Save the code sent state
				localStorage.setItem('deleteUserCodeSent', 'true');
				alert(
					'Confirmation code sent to your email. If you navigate away to check your email, you can return to this page to continue.'
				);
			} else {
				const data = await response.json();
				errorMessage =
					data.error || 'Failed to send the confirmation code. Please check your email.';
			}
		} catch (error) {
			errorMessage = 'Something went wrong. Please try again later.';
			console.error(error);
		} finally {
			isLoading = false;
		}
	};

	const verifyAndDelete = async () => {
		// Reset any existing error message
		errorMessage = '';
		isLoading = true;

		// Send confirmation code to backend to verify and delete data
		try {
			const response = await fetch('/api/delete-user-data', {
				method: 'POST',
				body: JSON.stringify({ email, confirmationCode }),
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				isVerified = true;
				// Clear localStorage on successful deletion
				localStorage.removeItem('deleteUserEmail');
				localStorage.removeItem('deleteUserCodeSent');
			} else {
				const data = await response.json();
				errorMessage = data.error || 'Invalid confirmation code. Please try again.';
			}
		} catch (error) {
			errorMessage = 'Something went wrong. Please try again later.';
			console.error(error);
		} finally {
			isLoading = false;
		}
	};

	const resetForm = () => {
		// Clear form and localStorage if user wants to start over
		email = '';
		confirmationCode = '';
		isCodeSent = false;
		isVerified = false;
		errorMessage = '';
		localStorage.removeItem('deleteUserEmail');
		localStorage.removeItem('deleteUserCodeSent');
	};
</script>

<div class="delete-account-container">
	<h2 class="delete-data-title">Delete Your Data from Clubfindr</h2>
	<div class="divider"></div>

	<div class="info-section">
		<p>We're sad to see you go. Please enter your email address below.</p>
		<p>
			We will send you a confirmation code to your email. Please then enter the code in the window,
			and it's done.
		</p>
		<p>
			Clubfindr will remove all personal data such as your name, email address, any Spotify tokens,
			or access data used for logging you in, and anything else that links to you personally.
		</p>
		<p>
			Clubfindr reserves the right to keep data we have collected such as genres or venue
			recommendations from your time with us to keep improving our recommendation systems. You're
			welcome back anytime.
		</p>
	</div>

	{#if !isVerified}
		<div class="form-container">
			{#if !isCodeSent}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						sendConfirmationCode();
					}}
					class="email-form"
				>
					<div class="form-group">
						<label for="email">Confirm your email:</label>
						<input
							type="email"
							id="email"
							bind:value={email}
							placeholder="Enter your email"
							required
						/>
					</div>

					<!-- Email validation -->
					{#if email && !email.includes('@')}
						<p class="validation-error">Please enter a valid email address.</p>
					{/if}

					<button
						type="submit"
						disabled={!!(isLoading || !email || (email && !email.includes('@')))}
					>
						{isLoading ? 'Sending...' : 'Send Confirmation Code'}
					</button>
				</form>
			{:else}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						verifyAndDelete();
					}}
					class="code-form"
				>
					<div class="form-group">
						<label for="confirmation-code">Enter Confirmation Code:</label>
						<input
							class="color-black"
							type="text"
							id="confirmation-code"
							bind:value={confirmationCode}
							placeholder="Enter the code sent to your email"
							required
						/>
					</div>
					<div class="button-group">
						<button
							type="submit"
							disabled={!!(isLoading || !confirmationCode)}
							class="verify-button"
						>
							{isLoading ? 'Verifying...' : 'Verify and Delete'}
						</button>
						<button type="button" onclick={resetForm} class="reset-button" disabled={false}>
							Start Over
						</button>
					</div>
					<p class="email-info">Confirmation code was sent to: <strong>{email}</strong></p>
					<p class="resend-info">
						Didn't receive the code? <button
							onclick={sendConfirmationCode}
							class="resend-button"
							disabled={!!isLoading}
						>
							Resend Code
						</button>
					</p>
				</form>
			{/if}

			{#if errorMessage}
				<p class="error-message">{errorMessage}</p>
			{/if}
		</div>
	{:else}
		<div class="success-message">
			<h3>Data Deleted Successfully</h3>
			<p>
				Your personal information has been removed from our systems. Thank you for using Clubfindr.
			</p>
		</div>
	{/if}
</div>

<style>
	.delete-account-container {
		max-width: 600px;
		margin: 0 auto;
		padding: 20px;
	}

	.delete-data-title {
		font-size: 2em;
		font-weight: bold;
		margin-bottom: 10px;
	}

	.divider {
		height: 2px;
		background-color: #ddd;
		margin-bottom: 20px;
	}

	.info-section {
		margin-bottom: 30px;
	}

	.info-section p {
		margin-bottom: 15px;
		line-height: 1.5;
	}

	.form-container {
		background-color: rgba(255, 255, 255, 0.1);
		padding: 20px;
		border-radius: 8px;
		margin-bottom: 20px;
	}

	.form-group {
		margin-bottom: 15px;
	}

	label {
		display: block;
		margin-bottom: 8px;
		font-weight: bold;
	}

	input {
		width: 100%;
		padding: 12px;
		border-radius: 5px;
		border: 1px solid #ccc;
		background-color: white;
		color: black;
		font-size: 16px;
		box-sizing: border-box;
	}

	button {
		padding: 12px 20px;
		border-radius: 5px;
		border: none;
		cursor: pointer;
		font-size: 16px;
		font-weight: bold;
		transition: background-color 0.3s;
	}

	.email-form button {
		background-color: #e63946;
		color: white;
		width: 100%;
	}

	.verify-button {
		background-color: #e63946;
		color: white;
		flex: 1;
	}

	.reset-button {
		background-color: #555;
		color: white;
		flex: 1;
	}

	.resend-button {
		background: none;
		color: #4da6ff;
		padding: 0;
		text-decoration: underline;
		font-weight: normal;
		font-size: 14px;
	}

	button:hover:not(:disabled) {
		opacity: 0.9;
	}

	button:disabled {
		background-color: #999;
		cursor: not-allowed;
	}

	.button-group {
		display: flex;
		gap: 10px;
		margin-bottom: 15px;
	}

	.validation-error {
		color: #e63946;
		margin-top: -10px;
		margin-bottom: 10px;
		font-size: 14px;
	}

	.email-info {
		font-size: 14px;
		margin-bottom: 5px;
	}

	.resend-info {
		font-size: 14px;
		color: #aaa;
	}

	.error-message {
		background-color: rgba(230, 57, 70, 0.1);
		border-left: 4px solid #e63946;
		padding: 10px 15px;
		margin-top: 15px;
		color: #e63946;
		border-radius: 4px;
	}

	.success-message {
		background-color: rgba(67, 160, 71, 0.1);
		border-left: 4px solid #43a047;
		padding: 20px;
		border-radius: 4px;
	}

	.success-message h3 {
		color: #43a047;
		margin-top: 0;
	}

	@media (max-width: 480px) {
		.button-group {
			flex-direction: column;
		}

		.delete-data-title {
			font-size: 1.5em;
		}
	}
</style>
