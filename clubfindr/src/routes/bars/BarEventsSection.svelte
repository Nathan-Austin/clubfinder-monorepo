<!-- BarEventsSection.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import BarEventModal from './BarEventModal.svelte';

	import type { EventDetails } from '$lib/types/events';
	import { toLocalIsoDate } from '$lib/localDate';
	interface Props {
		barId: string;
	}

	let { barId }: Props = $props();

	let events: EventDetails[] = $state([]);
	let isLoading = $state(false);
	let error = $state('');
	let showEventModal = $state(false);
	let currentEvent: EventDetails = $state({
		id: '',
		theme_name: '',
		description: '',
		event_date: toLocalIsoDate(),
		start_time: null,
		end_time: null,
		recurring: false,
		recurrence_pattern: null,
		special_genres: []
	});
	let modalSuccess = $state('');
	let modalError = $state('');
	let validationErrors: string[] = $state([]);

	// Format date for display
	function formatDate(dateString: string): string {
		const options: Intl.DateTimeFormatOptions = {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		};
		return new Date(dateString).toLocaleDateString('en-US', options);
	}

	// Format time for display
	function formatTime(timeString: string | null): string {
		if (!timeString) return '';
		return timeString.substring(0, 5); // Format as HH:MM
	}

	// Load events for this bar
	async function loadEvents() {
		isLoading = true;
		error = '';

		try {
			const response = await fetch(`/api/bars/${barId}/events`);

			if (!response.ok) {
				throw new Error(`Error fetching events: ${response.statusText}`);
			}

			const data = await response.json();
			events = data.events || [];
		} catch (err: unknown) {
			console.error('Failed to load events:', err);
			if (err instanceof Error) {
				error = err.message;
			} else {
				error = 'Failed to load events';
			}
		} finally {
			isLoading = false;
		}
	}

	// Open modal to create a new event
	function openCreateModal() {
		currentEvent = {
			id: '',
			theme_name: '',
			description: '',
			event_date: toLocalIsoDate(),
			start_time: null,
			end_time: null,
			recurring: false,
			recurrence_pattern: null,
			special_genres: []
		};
		modalSuccess = '';
		modalError = '';
		validationErrors = [];
		showEventModal = true;
	}

	// Open modal to edit an existing event
	function openEditModal(event: EventDetails) {
		currentEvent = { ...event };
		modalSuccess = '';
		modalError = '';
		validationErrors = [];
		showEventModal = true;
	}

	// Close the event modal
	function closeEventModal() {
		showEventModal = false;
	}

	// Submit event data (create or update)
	async function handleEventSubmit(eventData: EventDetails) {
		isLoading = true;
		modalError = '';
		validationErrors = [];

		try {
			console.log('Submitting event data:', eventData); // Debug log

			let url = `/api/bars/${barId}/events`;
			let method = 'POST';

			// If editing an existing event, use PUT
			if (eventData.id) {
				url = `${url}/${eventData.id}`;
				method = 'PUT';
			}

			console.log('Making request to:', url, 'with method:', method); // Debug log

			const response = await fetch(url, {
				method,
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(eventData)
			});

			console.log('Response status:', response.status); // Debug log

			const responseData = await response.json();
			console.log('Response data:', responseData); // Debug log

			if (!response.ok) {
				if (responseData.validationErrors) {
					validationErrors = responseData.validationErrors;
				}

				throw new Error(
					responseData.error || `Error ${eventData.id ? 'updating' : 'creating'} event`
				);
			}

			// Success!
			modalSuccess = `Event successfully ${eventData.id ? 'updated' : 'created'}!`;

			// Reload events
			await loadEvents();

			// Close modal after a delay
			setTimeout(() => {
				closeEventModal();
			}, 1500);
		} catch (err: unknown) {
			console.error('Failed to save event:', err);
			if (err instanceof Error) {
				modalError = err.message;
			} else {
				modalError = 'Failed to save event';
			}
		} finally {
			isLoading = false;
		}
	}

	// Delete an event
	async function deleteEvent(eventId: string) {
		if (!confirm('Are you sure you want to delete this event?')) {
			return;
		}

		isLoading = true;
		error = '';

		try {
			const response = await fetch(`/api/bars/${barId}/events/${eventId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error(`Error deleting event: ${response.statusText}`);
			}

			// Reload events
			await loadEvents();
		} catch (err: unknown) {
			console.error('Failed to delete event:', err);
			if (err instanceof Error) {
				error = err.message;
			} else {
				error = 'Failed to delete event';
			}
		} finally {
			isLoading = false;
		}
	}

	// Load events on component mount
	onMount(() => {
		loadEvents();
	});
</script>

<section class="events-section">
	<div class="section-header">
		<h2>Special Events & Themes</h2>
		<button class="add-event-button" onclick={openCreateModal}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="12" y1="5" x2="12" y2="19" />
				<line x1="5" y1="12" x2="19" y2="12" />
			</svg>
			Add Event
		</button>
	</div>

	{#if error}
		<div class="error-alert">
			{error}
		</div>
	{/if}

	{#if isLoading && !showEventModal}
		<div class="loading">Loading events...</div>
	{:else if events.length === 0}
		<div class="empty-state">
			<p>No events or special themes have been added yet.</p>
			<p>
				Create special themed nights, recurring events, or one-time occasions to attract customers.
			</p>
			<button class="create-first-event" onclick={openCreateModal}>Create Your First Event</button>
		</div>
	{:else}
		<div class="events-grid">
			{#each events as event (event.id)}
				<div class="event-card">
					<div class="event-header">
						<h3>{event.theme_name}</h3>
						<div class="event-actions">
							<button
								class="edit-button"
								aria-label="Edit {event.theme_name}"
								onclick={() => openEditModal(event)}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
									<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
								</svg>
							</button>
							<button
								class="delete-button"
								aria-label="Delete {event.theme_name}"
								onclick={() => deleteEvent(event.id)}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polyline points="3 6 5 6 21 6" />
									<path
										d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
									/>
								</svg>
							</button>
						</div>
					</div>
					<div class="event-date">
						<span>{formatDate(event.event_date)}</span>
						{#if event.recurring}
							<span class="recurring-badge">
								Recurring ({event.recurrence_pattern})
							</span>
						{/if}
					</div>
					{#if event.start_time || event.end_time}
						<div class="event-time">
							{#if event.start_time && event.end_time}
								{formatTime(event.start_time)} - {formatTime(event.end_time)}
							{:else if event.start_time}
								Starts at {formatTime(event.start_time)}
							{:else if event.end_time}
								Ends at {formatTime(event.end_time)}
							{/if}
						</div>
					{/if}
					{#if event.description}
						<p class="event-description">{event.description}</p>
					{/if}
					{#if event.special_genres && event.special_genres.length > 0}
						<div class="event-genres">
							{#each event.special_genres as genre, i (i)}
								<span class="genre-tag">{genre}</span>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>

{#if showEventModal}
	<BarEventModal
		eventDetails={currentEvent}
		{isLoading}
		errorMessage={modalError}
		{validationErrors}
		successMessage={modalSuccess}
		{barId}
		onclose={closeEventModal}
		onsubmit={handleEventSubmit}
	/>
{/if}

<style>
	.events-section {
		margin-top: 2rem;
		padding: 1.5rem;
		background-color: white;
		border-radius: 8px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.section-header h2 {
		margin: 0;
		font-size: 1.5rem;
		color: #333;
	}

	.add-event-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background-color: #1db954;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
		transition: background-color 0.2s;
	}

	.add-event-button:hover {
		background-color: #1aa34a;
	}

	.error-alert {
		background-color: #ffebee;
		color: #c62828;
		padding: 0.75rem;
		margin-bottom: 1rem;
		border-radius: 4px;
	}

	.loading {
		padding: 2rem;
		text-align: center;
		color: #666;
	}

	.empty-state {
		padding: 3rem 2rem;
		text-align: center;
		background-color: #f9f9f9;
		border-radius: 8px;
	}

	.empty-state p {
		margin: 0.5rem 0;
		color: #666;
	}

	.create-first-event {
		margin-top: 1.5rem;
		background-color: #1db954;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
	}

	.events-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.event-card {
		background-color: #f9f9f9;
		border-radius: 8px;
		padding: 1.25rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.event-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.event-header h3 {
		margin: 0;
		font-size: 1.2rem;
		color: #333;
	}

	.event-actions {
		display: flex;
		gap: 0.5rem;
	}

	.edit-button,
	.delete-button {
		background: none;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.edit-button {
		color: #2196f3;
	}

	.delete-button {
		color: #f44336;
	}

	.edit-button:hover,
	.delete-button:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}

	.event-date {
		font-weight: 500;
		margin-bottom: 0.5rem;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.recurring-badge {
		background-color: #e3f2fd;
		color: #1976d2;
		padding: 0.1rem 0.5rem;
		border-radius: 4px;
		font-size: 0.8rem;
	}

	.event-time {
		color: #666;
		margin-bottom: 0.75rem;
		font-size: 0.9rem;
	}

	.event-description {
		margin: 0.75rem 0;
		font-size: 0.95rem;
		color: #444;
		line-height: 1.4;
	}

	.event-genres {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.genre-tag {
		background-color: #e0f2e9;
		color: #2e7d32;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-size: 0.8rem;
	}
</style>
