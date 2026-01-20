<!-- promoter-home/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	import GenreSelector from './components/GenreSelector.svelte';
	import ArtistSearchForm from './components/ArtistSearchForm.svelte';
	import type { Performer, PerformerTrack } from '$lib/$types';

	import { Search } from 'lucide-svelte';
	export let data: PageData;

	// State management
	let isAddingEvent = false;
	let isLoading = false;
	let error: string | null = null;
	let performers: Performer[] = [];
	let expandedPerformerIndex: number | null = null;
	let selectedVenueId: string = '';

	let venueSearchTerm = '';
	let isSearching = false;
	let showVenueForm = false;
	let venueSuggestions: Venue[] = [];
	let newVenue: VenueInput = {
		name: '',
		address: '',
		city: '',
		isNew: true
	};
	interface VenueBase {
		name: string;
		address: string;
		city: string;
	}

	interface Venue extends VenueBase {
		id: string | null;
		isExisting: boolean;
	}

	interface VenueInput extends VenueBase {
		name: string;
		address: string;
		city: string;
		isNew?: boolean;
	}
	// Use the data from the server
	$: currentEvents = data.currentEvents;
	$: pastEvents = data.pastEvents;
	$: venues = data.venues;

	// Form state for new event
	let newEvent = {
		event_name: '',
		club_name: '',
		club_address: '',
		event_date: '',
		start_time: '',
		end_time: '',
		event_genres: [],
		price: '',
		event_image: '',
		city: '',
		venue_id: ''
	};
	// Watch for venue selection and update form
	$: selectedVenue = venues.find((v) => v.id === selectedVenueId);
	$: if (selectedVenue) {
		newEvent.venue_id = selectedVenue.id;
		newEvent.club_name = selectedVenue.name;
		newEvent.club_address = selectedVenue.address;
		newEvent.city = selectedVenue.city;
	}
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	export let currentRole = 'bar'; // 'bar' or 'promoter'

	let hasDualRole = false;

	onMount(() => {
		// Check if user has dual role by reading the cookie
		const cookies = document.cookie.split(';');
		for (let cookie of cookies) {
			const [name, value] = cookie.trim().split('=');
			if (name === 'hasDualRole' && value === 'true') {
				hasDualRole = true;
				break;
			}
		}
	});

	function switchRole() {
		// Simple navigation to the other role's home page
		if (currentRole === 'bar') {
			goto('/promoter-home');
		} else {
			goto('/bars');
		}
	}

	function resetForm() {
		newEvent = {
			event_name: '',
			club_name: '',
			club_address: '',
			event_date: '',
			start_time: '',
			end_time: '',
			event_genres: [],
			price: '',
			event_image: '',
			city: '',
			venue_id: ''
		};
		performers = [];
		selectedVenueId = '';
		expandedPerformerIndex = null;
	}

	function addPerformer() {
		const newPerformer: Performer = {
			artist_name: '',
			spotify_uri: '',
			soundcloud_link: '',
			bandcamp_link: '',
			facebook_link: '',
			instagram_link: '',
			ra_link: '',
			genres: [],
			email: '',
			website: '',
			primary_city: '',
			top_tracks: []
		};
		performers = [...performers, newPerformer];
		expandedPerformerIndex = performers.length - 1; // expand the new form
	}

	function handleArtistComplete(index: number, artistData: Performer) {
		performers[index] = artistData;
		performers = performers; // trigger reactivity
		//expandedPerformerIndex = null; // collapse the form after completion
	}

	function removePerformer(index: number) {
		performers.splice(index, 1);
		performers = performers;
	}

	function togglePerformer(index: number) {
		if (expandedPerformerIndex === index) {
			// If this performer is currently expanded, collapse it
			expandedPerformerIndex = null;
		} else {
			// Expand this performer, collapsing any other
			expandedPerformerIndex = index;
		}
	}

	async function handleSubmitEvent() {
		if (!selectedVenue) {
			error = 'Please select a venue';
			return;
		}

		try {
			isLoading = true;
			error = null;

			const eventData = {
				...newEvent,
				performers,
				venue_id: selectedVenueId,
				track_ids: performers.flatMap((performer) =>
					performer.top_tracks
						.filter((track) => track && track.id)
						.map((track) => ({
							id: track.id,
							name: track.name,
							artists: track.artists,
							display: track.display
						}))
				)
			};

			const response = await fetch('/promoter-home/events', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(eventData)
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to create event');
			}

			const createdEvent = await response.json();
			currentEvents = [createdEvent, ...currentEvents];
			isAddingEvent = false;
			resetForm();
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Failed to create event';
		} finally {
			isLoading = false;
		}
	}
	// Function to search venues
	async function searchVenues(searchTerm: string) {
		if (!searchTerm) {
			venueSuggestions = [];
			return;
		}

		// Debounce the search to prevent too many API calls
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(async () => {
			isSearching = true;
			try {
				const response = await fetch(`/api/venues/search?term=${encodeURIComponent(searchTerm)}`);
				if (!response.ok) throw new Error('Failed to search venues');
				const data = await response.json();
				venueSuggestions = data;
			} catch (err) {
				console.error('Error searching venues:', err);
				error = 'Failed to search venues';
			} finally {
				isSearching = false;
			}
		}, 300); // Wait 300ms before searching
	}

	// Function to handle venue selection or creation
	function isExistingVenue(venue: Venue | VenueInput): venue is Venue {
		return 'isExisting' in venue;
	}

	function handleVenueSelection(venue: Venue | VenueInput) {
		if (isExistingVenue(venue) && venue.isExisting && venue.id) {
			// Existing venue from bars table
			selectedVenueId = venue.id;
			newEvent.club_name = venue.name;
			newEvent.club_address = venue.address;
			newEvent.city = venue.city;
		} else {
			// Venue from events table or new venue
			newEvent.club_name = venue.name;
			newEvent.club_address = venue.address;
			newEvent.city = venue.city;
			selectedVenueId = ''; // Clear selected venue ID for new venues
		}
		venueSearchTerm = '';
		venueSuggestions = [];
		showVenueForm = false;
	}
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	$: if (venueSearchTerm) {
		searchVenues(venueSearchTerm);
	}
	function showNewVenueForm() {
		showVenueForm = true;
		venueSuggestions = []; // Clear suggestions
		venueSearchTerm = ''; // Clear search term
	}

	// Reset form function should also clear venue-related states
	function resetVenueForm() {
		showVenueForm = false;
		venueSuggestions = [];
		venueSearchTerm = '';
		newVenue = {
			name: '',
			address: '',
			city: '',
			isNew: true
		};
	}
</script>

<div class="container mx-auto px-4 py-8">
	<header class="mb-8">
		<h1 class="text-4xl font-bold mb-4">Promoter Dashboard</h1>
		{#if hasDualRole}
			<div class="role-switcher">
				<button on:click={switchRole} class="switcher-button">
					Switch to {currentRole === 'bar' ? 'Promoter' : 'Bar Manager'} Dashboard
				</button>
			</div>
		{/if}
		<div class="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
			<div>
				<p class="text-white text-2xl font-bold">Create and manage your events</p>
			</div>
			<div>
				<button
					class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2"
					on:click={() => (isAddingEvent = true)}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="white">
						<path
							fill-rule="evenodd"
							d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
							clip-rule="evenodd"
						/>
					</svg>
					Add New Event
				</button>
			</div>
		</div>
	</header>

	{#if error}
		<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
			{error}
		</div>
	{/if}

	{#if isAddingEvent}
		<div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
			<div class="flex justify-between items-center mb-6">
				<h2 class="text-2xl font-bold">Add New Event</h2>
				<button
					type="button"
					class="text-gray-500 hover:text-gray-700"
					on:click={() => {
						isAddingEvent = false;
						resetForm();
					}}
				>
					×
				</button>
			</div>

			<form on:submit|preventDefault={handleSubmitEvent} class="space-y-6">
				<!-- Event Name -->
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="event_name">
						Event Name *
					</label>
					<input
						id="event_name"
						type="text"
						bind:value={newEvent.event_name}
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
						required
					/>
				</div>

				<div class="space-y-4">
					<!-- svelte-ignore a11y-label-has-associated-control -->
					<label class="block text-gray-700 text-sm font-bold mb-2"> Venue * </label>

					<!-- Search input -->
					<div class="relative">
						<input
							type="text"
							bind:value={venueSearchTerm}
							placeholder="Search for a venue or enter a new one"
							class="shadow appearance-none border rounded w-full py-2 px-3 pr-10 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
						/>
						{#if isSearching}
							<div
								class="absolute right-3 top-2.5 animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"
							/>
						{:else}
							<Search class="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
						{/if}
					</div>

					<!-- Suggestions dropdown -->
					{#if (venueSuggestions.length > 0 || venueSearchTerm) && !showVenueForm}
						<div
							class="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg max-h-60 overflow-y-auto"
						>
							{#if venueSuggestions.length > 0}
								{#each venueSuggestions as venue}
									<button
										type="button"
										class="w-full text-left px-4 py-2 hover:bg-gray-100"
										on:click={() => handleVenueSelection(venue)}
									>
										<div class="font-medium">
											{venue.name}
											{#if venue.isExisting}
												<span class="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
													Existing Venue
												</span>
											{/if}
										</div>
										<div class="text-sm text-gray-600">{venue.address}, {venue.city}</div>
									</button>
								{/each}
							{/if}
							{#if venueSearchTerm}
								<button
									type="button"
									class="w-full text-left px-4 py-2 text-blue-600 hover:bg-gray-100"
									on:click={showNewVenueForm}
								>
									+ Add new venue
								</button>
							{/if}
						</div>
					{/if}

					<!-- New venue form -->
					{#if showVenueForm}
						<div class="mt-4 p-4 border rounded-md bg-gray-50">
							<h3 class="font-bold mb-4">Add New Venue</h3>
							<div class="space-y-4">
								<div>
									<!-- svelte-ignore a11y-label-has-associated-control -->
									<label class="block text-sm font-medium mb-1">Venue Name *</label>
									<input
										type="text"
										bind:value={newVenue.name}
										class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
										required
									/>
								</div>
								<div>
									<!-- svelte-ignore a11y-label-has-associated-control -->
									<label class="block text-sm font-medium mb-1">Address *</label>
									<input
										type="text"
										bind:value={newVenue.address}
										class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
										required
									/>
								</div>
								<div>
									<!-- svelte-ignore a11y-label-has-associated-control -->
									<label class="block text-sm font-medium mb-1">City *</label>
									<input
										type="text"
										bind:value={newVenue.city}
										class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"
										required
									/>
								</div>
								<div class="flex justify-end space-x-2">
									<button
										type="button"
										class="px-4 py-2 text-gray-600 hover:text-gray-800"
										on:click={resetVenueForm}
									>
										Cancel
									</button>
									<button
										type="button"
										class="px-4 py-2 bg-blue-500 text-black rounded hover:bg-blue-600"
										on:click={() => handleVenueSelection(newVenue)}
									>
										Add Venue
									</button>
								</div>
							</div>
						</div>
					{/if}

					<!-- Selected venue display -->
					{#if newEvent.club_name}
						<div class="mt-4 p-4 border rounded-md bg-gray-50">
							<h3 class="font-medium">Selected Venue</h3>
							<div class="mt-2">
								<div class="font-medium">{newEvent.club_name}</div>
								<div class="text-sm text-gray-600">{newEvent.club_address}, {newEvent.city}</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Venue Details (Read-only when venue is selected) -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<label class="block text-gray-700 text-sm font-bold mb-2">Venue Address</label>
						<input
							type="text"
							value={newEvent.club_address}
							class="bg-gray-100 w-full py-2 px-3 rounded"
							readonly
						/>
					</div>
					<div>
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<label class="block text-gray-700 text-sm font-bold mb-2">City</label>
						<input
							type="text"
							value={newEvent.city}
							class="bg-gray-100 w-full py-2 px-3 rounded"
							readonly
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<!-- Event Date -->
					<div>
						<label class="block text-gray-700 text-sm font-bold mb-2" for="event_date">
							Event Date *
						</label>
						<input
							id="event_date"
							type="date"
							bind:value={newEvent.event_date}
							min={new Date().toISOString().split('T')[0]}
							class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
							required
						/>
					</div>

					<!-- Start Time -->
					<div>
						<label class="block text-gray-700 text-sm font-bold mb-2" for="start_time">
							Start Time *
						</label>
						<input
							id="start_time"
							type="time"
							bind:value={newEvent.start_time}
							class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
							required
						/>
					</div>

					<!-- End Time -->
					<div>
						<label class="block text-gray-700 text-sm font-bold mb-2" for="end_time">
							End Time *
						</label>
						<input
							id="end_time"
							type="time"
							bind:value={newEvent.end_time}
							class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
							required
						/>
					</div>
				</div>

				<!-- Price -->
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="price">Price *</label>
					<input
						id="price"
						type="text"
						bind:value={newEvent.price}
						placeholder="e.g. £10 / £15 on door"
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
						required
					/>
				</div>

				<!-- Event Image URL -->
				<div>
					<label class="block text-gray-700 text-sm font-bold mb-2" for="event_image">
						Event Image URL
					</label>
					<input
						id="event_image"
						type="url"
						bind:value={newEvent.event_image}
						class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
					/>
				</div>

				<!-- Event Genres -->
				<div>
					<!-- svelte-ignore a11y-label-has-associated-control -->
					<label class="block text-gray-700 text-sm font-bold mb-2">Event Genres *</label>
					<GenreSelector bind:selectedGenres={newEvent.event_genres} />
				</div>

				<!-- Performers Section -->
				<div class="space-y-4">
					<!-- Performers Header -->
					<h3 class="text-xl font-bold">Performers</h3>

					<!-- Add Initial Performer Button -->
					{#if performers.length === 0}
						<div class="mb-4">
							<button
								type="button"
								class="bg-blue-500 hover:bg-blue-600 text-black px-4 py-2 rounded flex items-center gap-2"
								on:click={addPerformer}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5"
									viewBox="0 0 20 20"
									fill="currentColor"
								>
									<path
										fill-rule="evenodd"
										d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
										clip-rule="evenodd"
									/>
								</svg>
								Add Performer
							</button>
						</div>
					{/if}

					<!-- Performers List -->
					{#each performers as performer, index}
						<div class="border rounded-lg p-4 bg-gray-50">
							<!-- Performer Header -->
							<div class="flex justify-between items-center mb-4">
								<h4 class="font-bold">
									{performer.artist_name || `Performer ${index + 1}`}
								</h4>
								<button
									type="button"
									class="text-gray-500 hover:text-gray-700"
									on:click={() => togglePerformer(index)}
								>
									{#if expandedPerformerIndex === index}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-6 w-6"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M5 15l7-7 7 7"
											/>
										</svg>
									{:else}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-6 w-6"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M19 9l-7 7-7-7"
											/>
										</svg>
									{/if}
								</button>
							</div>

							<!-- Performer Form -->
							{#if expandedPerformerIndex === index}
								<ArtistSearchForm
									{handleArtistComplete}
									initialData={performer}
									{index}
									expanded={true}
								/>
							{/if}

							<!-- Action Buttons -->
							<div class="flex justify-end gap-2 mt-4">
								<button
									type="button"
									class="px-4 py-2 bg-green-500 text-black rounded hover:bg-green-600"
									on:click={() => {
										if (performer.artist_name) {
											togglePerformer(index);
										} else {
											error = 'Please complete performer details first';
										}
									}}
								>
									{expandedPerformerIndex === index ? 'Complete' : 'Edit'}
								</button>
								<button
									type="button"
									class="px-4 py-2 bg-blue-500 text-black rounded hover:bg-blue-600"
									on:click={addPerformer}
								>
									Add Another Performer
								</button>
								<button
									type="button"
									class="px-4 py-2 bg-red-500 text-black rounded hover:bg-red-600"
									on:click={() => removePerformer(index)}
								>
									Remove
								</button>
							</div>
						</div>
					{/each}
				</div>

				<div class="flex items-center justify-end gap-4">
					<button
						type="button"
						class="bg-gray-500 hover:bg-gray-600 text-black px-4 py-2 rounded"
						on:click={() => {
							isAddingEvent = false;
							resetForm();
						}}
						disabled={isLoading}
					>
						Cancel
					</button>
					<button
						type="submit"
						class="bg-blue-500 hover:bg-blue-600 text-black px-4 py-2 rounded flex items-center gap-2"
						disabled={isLoading}
					>
						{#if isLoading}
							<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
						{/if}
						Create Event
					</button>
				</div>
			</form>
		</div>
	{/if}

	<!-- Current Events Display -->
	<section class="mb-8">
		<h2 class="text-2xl font-bold mb-4">Current Events</h2>
		{#if currentEvents.length === 0}
			<p class="text-gray-600">No current events</p>
		{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each currentEvents as event (event.id)}
					<div class="bg-white shadow-md rounded-lg p-6">
						{#if event.event_image}
							<img
								src={event.event_image}
								alt={event.event_name}
								class="w-full h-48 object-cover rounded-t-lg mb-4"
							/>
						{/if}
						<h3 class="text-xl font-bold mb-2">{event.event_name}</h3>
						<p class="text-gray-600 mb-2">{event.club_name}</p>
						<p class="text-gray-600 mb-2">{new Date(event.event_date).toLocaleDateString()}</p>
						<p class="text-gray-600 mb-2">
							{event.start_time} - {event.end_time}
						</p>
						<p class="text-gray-600 mb-2">{event.price}</p>
						<div class="flex flex-wrap gap-2 mb-4">
							{#each event.event_genres as genre}
								<span class="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded">
									{genre}
								</span>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Past Events Display -->
	<section>
		<h2 class="text-2xl font-bold mb-4">Past Events</h2>
		{#if pastEvents.length === 0}
			<p class="text-gray-600">No past events</p>
		{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each pastEvents as event (event.id)}
					<div class="bg-gray-100 shadow-md rounded-lg p-6">
						{#if event.event_image}
							<img
								src={event.event_image}
								alt={event.event_name}
								class="w-full h-48 object-cover rounded-t-lg mb-4"
							/>
						{/if}
						<h3 class="text-xl font-bold mb-2">{event.event_name}</h3>
						<p class="text-gray-600 mb-2">{event.club_name}</p>
						<p class="text-gray-600 mb-2">{new Date(event.event_date).toLocaleDateString()}</p>
						<p class="text-gray-600 mb-2">
							{event.start_time} - {event.end_time}
						</p>
						<div class="flex flex-wrap gap-2">
							{#each event.event_genres as genre}
								<span class="bg-gray-200 text-gray-700 text-sm px-2 py-1 rounded">
									{genre}
								</span>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	/* Add smooth transitions */
	button {
		transition: all 0.2s ease-in-out;
	}
	.role-switcher {
		padding: 0.5rem;
	}

	.switcher-button {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 1rem;
		background-color: #f0f0f0;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 0.9rem;
		color: #333;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.switcher-button:hover {
		background-color: #e0e0e0;
	}
</style>
