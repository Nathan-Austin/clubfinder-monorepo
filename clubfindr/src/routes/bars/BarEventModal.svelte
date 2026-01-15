<!-- BarEventModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { slide } from 'svelte/transition';
	import type { EventDetails } from '$lib/types/events';

	export let eventDetails: EventDetails = {
		id: '',
		theme_name: '',
		description: '',
		event_date: new Date().toISOString().split('T')[0],
		start_time: null,
		end_time: null,
		recurring: false,
		recurrence_pattern: null,
		special_genres: []
	};

	export let isLoading = false;
	export let errorMessage = '';
	export let validationErrors: string[] = [];
	export let successMessage = '';
	export let barId = '';

	// For genre selection
	let availableGenres = [
		'House',
		'Techno',
		'Hip-Hop',
		'R&B',
		'Jazz',
		'Rock',
		'Live Music',
		'Indie',
		'Reggae',
		'Latin',
		'Blues',
		'Acoustic',
		'Pop',
		'EDM',
		'Country',
		'Folk',
		'Soul',
		'Funk'
	];
	let selectedGenres: string[] = eventDetails.special_genres || [];
	let newGenre = '';

	const dispatch = createEventDispatcher();

	function closeModal() {
		dispatch('close');
	}

	function handleSubmit() {
		// Update genres from selection
		eventDetails.special_genres = selectedGenres;

		// Format the date and time fields
		const formattedEvent = {
			...eventDetails,
			bar_id: barId,
			event_date: new Date(eventDetails.event_date).toISOString().split('T')[0],
			// Only include time fields if they have values
			start_time: eventDetails.start_time || null,
			end_time: eventDetails.end_time || null,
			// Ensure boolean and array fields are properly formatted
			recurring: Boolean(eventDetails.recurring),
			recurrence_pattern: eventDetails.recurring ? eventDetails.recurrence_pattern : null,
			special_genres: selectedGenres
		};

		// Dispatch the submit event with the formatted event details
		dispatch('submit', formattedEvent);
	}

	// Function to add a custom genre
	function addCustomGenre() {
		if (newGenre && !selectedGenres.includes(newGenre)) {
			selectedGenres = [...selectedGenres, newGenre];
			newGenre = '';
		}
	}

	// Function to toggle a genre selection
	function toggleGenre(genre: string) {
		if (selectedGenres.includes(genre)) {
			selectedGenres = selectedGenres.filter((g) => g !== genre);
		} else {
			selectedGenres = [...selectedGenres, genre];
		}
	}

	// Function to remove a genre
	function removeGenre(genre: string) {
		selectedGenres = selectedGenres.filter((g) => g !== genre);
	}
</script>

<div class="modal-backdrop">
	<div class="modal" transition:slide={{ duration: 300 }}>
		<div class="modal-header">
			<h2>{eventDetails.id ? 'Update Event' : 'Create New Event'}</h2>
			<button class="close-button" on:click={closeModal}>×</button>
		</div>

		<form id="event-details-form" on:submit|preventDefault={handleSubmit}>
			<!-- Hidden field to store event ID if editing -->
			<input type="hidden" id="eventId" name="eventId" value={eventDetails.id || ''} />

			<div class="form-group">
				<label for="themeName">Event Theme/Name</label>
				<input
					type="text"
					id="themeName"
					bind:value={eventDetails.theme_name}
					placeholder="e.g., Jazz Night, Salsa Tuesday, Karaoke Party"
					required
				/>
			</div>

			<div class="form-group">
				<label for="eventDate">Event Date</label>
				<input type="date" id="eventDate" bind:value={eventDetails.event_date} required />
			</div>

			<div class="form-row">
				<div class="form-group half-width">
					<label for="startTime">Start Time</label>
					<input type="time" id="startTime" bind:value={eventDetails.start_time} />
				</div>

				<div class="form-group half-width">
					<label for="endTime">End Time</label>
					<input type="time" id="endTime" bind:value={eventDetails.end_time} />
				</div>
			</div>

			<div class="form-group">
				<label for="description">Description</label>
				<textarea
					id="description"
					bind:value={eventDetails.description}
					placeholder="Describe your event, special offers, featured performers, etc."
					rows="4"
				/>
			</div>

			<div class="form-group checkbox-group">
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={eventDetails.recurring} />
					Is this a recurring event?
				</label>
			</div>

			{#if eventDetails.recurring}
				<div class="form-group">
					<label for="recurrencePattern">Recurrence Pattern</label>
					<select id="recurrencePattern" bind:value={eventDetails.recurrence_pattern}>
						<option value="daily">Daily</option>
						<option value="weekly">Weekly</option>
						<option value="biweekly">Bi-weekly</option>
						<option value="monthly">Monthly</option>
					</select>
				</div>
			{/if}

			<div class="form-group">
				<label>Music Genres for this Event</label>
				<div class="genres-grid">
					{#each availableGenres as genre}
						<label class="genre-tag">
							<input
								type="checkbox"
								value={genre}
								checked={selectedGenres.includes(genre)}
								on:change={() => toggleGenre(genre)}
							/>
							{genre}
						</label>
					{/each}
				</div>
			</div>

			<div class="form-group">
				<label for="customGenre">Add Custom Genre</label>
				<div class="add-genre-row">
					<input
						type="text"
						id="customGenre"
						bind:value={newGenre}
						placeholder="Enter custom genre"
					/>
					<button
						type="button"
						class="add-genre-button"
						on:click={addCustomGenre}
						disabled={!newGenre}
					>
						Add
					</button>
				</div>
			</div>

			{#if selectedGenres.length > 0}
				<div class="selected-genres">
					<p>Selected Genres:</p>
					<div class="selected-genres-list">
						{#each selectedGenres as genre}
							<span class="selected-genre">
								{genre}
								<button type="button" class="remove-genre" on:click={() => removeGenre(genre)}
									>×</button
								>
							</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if errorMessage}
				<div class="error-message">
					{errorMessage}
				</div>
			{/if}

			{#if validationErrors && validationErrors.length > 0}
				<div class="validation-errors">
					<p>Please fix the following issues:</p>
					<ul>
						{#each validationErrors as error}
							<li class="error-message">{error}</li>
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
					{isLoading ? 'Saving...' : eventDetails.id ? 'Update Event' : 'Create Event'}
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

	.form-row {
		display: flex;
		gap: 1rem;
	}

	.half-width {
		width: 50%;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
	}

	input,
	textarea,
	select {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 1rem;
	}

	textarea {
		resize: vertical;
	}

	.checkbox-group {
		display: flex;
		align-items: center;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.checkbox-label input[type='checkbox'] {
		width: auto;
	}

	.genres-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.genre-tag {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.genre-tag input {
		width: auto;
	}

	.add-genre-row {
		display: flex;
		gap: 0.5rem;
	}

	.add-genre-button {
		background-color: #1db954;
		color: white;
		border: none;
		border-radius: 4px;
		padding: 0.75rem 1rem;
		cursor: pointer;
		flex-shrink: 0;
	}

	.add-genre-button:disabled {
		background-color: #a5d6b7;
		cursor: not-allowed;
	}

	.selected-genres {
		margin-bottom: 1.25rem;
		background-color: #f9f9f9;
		padding: 0.75rem;
		border-radius: 4px;
	}

	.selected-genres p {
		margin-top: 0;
		margin-bottom: 0.5rem;
		font-weight: 500;
	}

	.selected-genres-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.selected-genre {
		display: inline-flex;
		align-items: center;
		background: #e0f2e9;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.remove-genre {
		background: transparent;
		border: none;
		color: #666;
		cursor: pointer;
		font-size: 1rem;
		margin-left: 0.25rem;
		padding: 0 0.25rem;
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

	.success-message {
		background-color: #e8f5e9;
		color: #2e7d32;
		padding: 0.75rem;
		margin-bottom: 1rem;
		border-radius: 4px;
	}
</style>
