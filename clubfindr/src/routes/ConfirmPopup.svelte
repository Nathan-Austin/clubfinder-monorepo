<script lang="ts">
	import { createEventDispatcher } from 'svelte';

let confirmationCode = '';
	let errorMessage = '';
	let successMessage = '';
	let loading = false;
	const dispatch = createEventDispatcher();
	// Function to handle the confirmation form submission
	async function submitConfirmation() {
		loading = true;
		errorMessage = '';
		successMessage = '';
		const email = localStorage.getItem('userEmail');
		try {
			const response = await fetch('/api/verify-confirmation', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ email, confirmationCode })
			});

			const result = await response.json();

			if (response.ok && result.success) {
				successMessage = 'Email confirmed successfully!';
				dispatch('close'); // Trigger the close event when successful
			} else {
				errorMessage = result.message || 'Invalid confirmation code. Please try again.';
			}
		} catch (error) {
			console.error('Error verifying confirmation code:', error);
			errorMessage = 'An error occurred. Please try again later.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="modal-overlay">
	<div class="modal-content">
		<h2 style="color: black;">Enter Confirmation Code</h2>
		<form on:submit|preventDefault={submitConfirmation}>
			<label for="confirmation-code">Confirmation Code</label>
			<input
				type="text"
				id="confirmation-code"
				bind:value={confirmationCode}
				placeholder="Enter the confirmation code"
				required
				style="color: black;"
			/>

			{#if errorMessage}
				<p style="color: red;">{errorMessage}</p>
			{/if}

			{#if successMessage}
				<p style="color: green;">{successMessage}</p>
			{/if}

			<button type="submit" disabled={loading}>Submit</button>
		</form>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000; /* Ensures the popup is above other content */
	}

	.modal-content {
		background-color: white;
		padding: 20px;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		width: 300px;
		max-width: 100%;
		z-index: 1001;
	}

	form {
		display: flex;
		flex-direction: column;
	}

	input {
		margin-bottom: 10px;
		padding: 10px;
		border: 1px solid #ccc;
		border-radius: 4px;
		width: 100%;
	}

	button {
		padding: 10px;
		background-color: #007bff;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	button[disabled] {
		background-color: #ccc;
		cursor: not-allowed;
	}
</style>
