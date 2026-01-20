<!-- BarDetailsModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { slide } from 'svelte/transition';

	export let barDetails = {
		id: '',
		name: '',
		address: '',
		city: '',
		phone: '',
		email: '',
		openingHours: '',
		description: ''
	};

	export let isLoading = false;
	export let errorMessage = '';
	export let validationErrors: string[] = [];
	export let successMessage = '';

	const dispatch = createEventDispatcher();

	function closeModal() {
		dispatch('close');
	}

	function handleSubmit() {
		// Get the barId from the hidden field
		const form = document.getElementById('bar-details-form');
		const barIdField = form ? form.querySelector('#barId') : null;
		const barId = barIdField ? (barIdField as HTMLInputElement).value : barDetails.id || '';

		// Include the barId in the submission
		dispatch('submit', {
			...barDetails,
			id: barId
		});
	}
</script>

<div class="modal-backdrop">
	<div class="modal" transition:slide={{ duration: 300 }}>
		<div class="modal-header">
			<h2>Update Bar Details</h2>
			<button class="close-button" on:click={closeModal}>×</button>
		</div>

		<form id="bar-details-form" on:submit|preventDefault={handleSubmit}>
			<!-- Hidden field to store bar ID -->
			<input type="hidden" id="barId" name="barId" value={barDetails.id || ''} />

			<div class="form-group">
				<label for="barName">Bar Name</label>
				<input type="text" id="barName" bind:value={barDetails.name} required />
			</div>

			<div class="form-group">
				<label for="address">Address</label>
				<input type="text" id="address" bind:value={barDetails.address} required />
			</div>

			<div class="form-group">
				<label for="city">City</label>
				<input type="text" id="city" bind:value={barDetails.city} required />
			</div>

			<div class="form-group">
				<label for="telephone">Telephone</label>
				<input type="tel" id="phone" bind:value={barDetails.phone} required />
			</div>

			<div class="form-group">
				<label for="email">Email</label>
				<input type="email" id="email" bind:value={barDetails.email} required />
			</div>

			<div class="form-group">
				<label for="openingHours">Opening Hours</label>
				<textarea id="openingHours" bind:value={barDetails.openingHours} rows="3" />
			</div>

			<div class="form-group">
				<label for="description"
					>Description - add some details about your bar, such as general vibe, musical tastes, and
					any other relevant information.</label
				>
				<textarea id="description" bind:value={barDetails.description} rows="4" />
			</div>

			{#if errorMessage}
				<div class="error-message">
					{errorMessage}
				</div>

				<details class="debug-section">
					<summary>Debug Information</summary>
					<div class="debug-content">
						<p>This information might help troubleshoot the issue:</p>
						<ul>
							<li>Bar ID: {barDetails.id || 'Not available'}</li>
							<li>Cookies available: {typeof document !== 'undefined' ? 'Yes' : 'No'}</li>
							<li>
								barId cookie: {typeof document !== 'undefined'
									? document.cookie.includes('barId=')
										? 'Present'
										: 'Missing'
									: 'Unknown'}
							</li>
						</ul>
					</div>
				</details>
			{/if}

			{#if validationErrors && validationErrors.length > 0}
				<div class="validation-errors">
					<p>Please fix the following issues:</p>
					<ul>
						{#each validationErrors as error}
							<li>{error}</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if successMessage}
				<div class="success-message">
					{successMessage}
				</div>
			{/if}

			<div class="button-group">
				<button type="button" class="cancel-button" on:click={closeModal}>Cancel</button>
				<button type="submit" class="submit-button" disabled={isLoading}>
					{isLoading ? 'Updating...' : 'Update Details'}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: white;
		padding: 2rem;
		border-radius: 8px;
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
		width: 90%;
		max-width: 600px;
		max-height: 90vh;
		overflow-y: auto;
		color: #333;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid #eee;
		padding-bottom: 1rem;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.5rem;
	}

	.close-button {
		background: transparent;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: #777;
	}

	.form-group {
		margin-bottom: 1.25rem;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
	}

	input,
	textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 1rem;
	}

	textarea {
		resize: vertical;
	}

	.button-group {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.cancel-button {
		padding: 0.75rem 1.5rem;
		background-color: #f5f5f5;
		color: #333;
		border: 1px solid #ddd;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.submit-button {
		padding: 0.75rem 1.5rem;
		background-color: #1db954;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.submit-button:hover {
		background-color: #1aa34a;
	}

	.submit-button:disabled {
		background-color: #a5d6b7;
		cursor: not-allowed;
	}

	.error-message,
	.validation-errors {
		background-color: #ffebee;
		color: #c62828;
		padding: 0.75rem;
		margin-bottom: 1rem;
		border-radius: 4px;
	}

	.debug-section {
		margin-top: 1rem;
		padding: 0.5rem;
		background-color: #f8f8f8;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	.debug-section summary {
		cursor: pointer;
		font-weight: 500;
		color: #555;
	}

	.debug-content {
		margin-top: 0.5rem;
		padding: 0.5rem;
		background-color: #fff;
		border: 1px solid #eee;
		border-radius: 4px;
		font-family: monospace;
		font-size: 0.9rem;
	}

	.debug-content ul {
		margin: 0.5rem 0 0 1.5rem;
		padding: 0;
	}

	.success-message {
		background-color: #e8f5e9;
		color: #2e7d32;
		padding: 0.75rem;
		margin-bottom: 1rem;
		border-radius: 4px;
	}
</style>
