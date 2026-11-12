<!-- routes/bars/+page.svelte -->
<!-- This file is the main page for the bars page in the ClubFindr system. -->
<!-- It includes the main bar details section, bar events section, and bar details modal. -->

<script lang="ts">
	import type { PageData } from './$types';
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import BarDetailsModal, { type BarDetails } from './BarDetailsModal.svelte';
	import BarEventsSection from './BarEventsSection.svelte';
	import VenueArtistsSection from './VenueArtistsSection.svelte';
	import VenueGenresSection from './VenueGenresSection.svelte';
	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const currentRole = 'bar';

	// Editable copy of the name (updated after the details form is saved)
	// svelte-ignore state_referenced_locally
	let barName = $state(data.barName || null);
	let showBarDetailsModal = $state(false);
	let hasDualRole = $state(false);
	let error: string | null = $derived(data.error ?? null);

	// Check if we can access the barId directly from data
	let barId: string = $derived(data.barId ?? '');

	// Initial bar details state
	let barDetails = $state({
		id: '', // Add id field to store it if we can get it from the API
		name: untrack(() => barName) || '', // initial value only; the form edits its own copy
		address: '',
		city: '',
		phone: '',
		email: '',
		openingHours: '',
		description: '',
		smoking_allowed: false,
		bar_types: [] as string[]
	});

	let barDetailsLoading = $state(false);
	let barDetailsError = $state('');
	let barDetailsSuccess = $state('');
	let barDetailsValidationErrors: string[] = $state([]);

	let showDebugInfo = $state(false);
	let manualBarId = $state('');

	function toggleDebugInfo() {
		showDebugInfo = !showDebugInfo;
	}

	function setManualBarId() {
		if (manualBarId) {
			console.log('Setting manual barId:', manualBarId);
			barDetails.id = manualBarId;
			document.cookie = `barId=${manualBarId}; path=/; max-age=3600; secure; samesite=lax`;
			alert(`Bar ID set to: ${manualBarId}`);
		}
	}

	function getCookie(name: string) {
		const value = `; ${document.cookie}`;
		const parts = value.split(`; ${name}=`);
		if (parts.length === 2) {
			const cookieValue = parts.pop()?.split(';').shift();
			console.log(`Retrieved cookie ${name}:`, cookieValue);
			return cookieValue;
		}
		console.log(`Cookie ${name} not found`);
		return null;
	}

	onMount(async () => {
		// Check for dual role
		const cookies = document.cookie.split(';');
		for (let cookie of cookies) {
			const [name, value] = cookie.trim().split('=');
			if (name === 'hasDualRole' && value === 'true') {
				hasDualRole = true;
				break;
			}
		}

		// Fetch bar details if needed
		try {
			// Try different methods to get barId
			let fetchBarId = getCookie('barId');

			// If not in cookie, try from page data
			if (!fetchBarId && barId) {
				fetchBarId = barId;
				console.log('Using barId from page data for fetch:', fetchBarId);
			}

			console.log('Fetching details for bar ID:', fetchBarId);

			if (fetchBarId) {
				const response = await fetch(`/api/bars/${fetchBarId}`);
				console.log('Bar details response status:', response.status);

				if (response.ok) {
					const barData = await response.json();
					console.log('Retrieved bar data:', barData);

					barDetails = {
						id: barData.id || '',
						name: barData.name || '',
						address: barData.address || '',
						city: barData.city || '',
						phone: barData.phone || '',
						email: barData.general_email || '',
						openingHours: barData.opening_hours || '',
						description: barData.description || '',
						smoking_allowed: barData.smoking_allowed || false,
						bar_types: barData.bar_types || []
					};
				} else {
					console.error('Failed to fetch bar details, status:', response.status);
					try {
						const errorData = await response.json();
						console.error('Error response:', errorData);
					} catch {
						console.error('Could not parse error response');
					}
				}
			} else {
				console.error('No barId cookie found during bar details fetch');
			}
		} catch (error) {
			console.error('Error fetching bar details:', error);
		}
	});

	function openBarDetailsModal() {
		showBarDetailsModal = true;
	}

	function closeBarDetailsModal() {
		showBarDetailsModal = false;
		barDetailsError = '';
		barDetailsSuccess = '';
		barDetailsValidationErrors = [];
	}

	async function handleBarDetailsSubmit(updatedDetails: BarDetails) {
		barDetailsLoading = true;
		barDetailsError = '';
		barDetailsSuccess = '';
		barDetailsValidationErrors = [];

		try {
			// Try different methods to get the barId
			// 1. Try to get barId from event data (from modal)
			let submissionBarId: string | null | undefined = updatedDetails.id;

			// 2. Try to get barId from cookie
			if (!submissionBarId) {
				submissionBarId = getCookie('barId');
			}

			// 3. If no barId in cookie, try to use the one from loaded bar details
			if (!submissionBarId && barDetails && barDetails.id) {
				submissionBarId = barDetails.id;
				console.log('Using barId from loaded details:', submissionBarId);
			}

			// 4. Try to use the barId from page data
			if (!submissionBarId && barId) {
				submissionBarId = barId;
				console.log('Using barId from page data:', submissionBarId);
			}

			console.log('Attempting to update bar with ID:', submissionBarId);

			if (!submissionBarId) {
				console.error('Bar ID not found in cookies, loaded data, or page data');
				throw new Error('Bar ID not found. Please log in again.');
			}

			// Log the request details
			console.log('Sending update to:', `/api/bars/${submissionBarId}`);
			console.log('Update payload:', {
				name: updatedDetails.name,
				address: updatedDetails.address,
				city: updatedDetails.city,
				phone: updatedDetails.phone,
				general_email: updatedDetails.email,
				opening_hours: updatedDetails.openingHours,
				description: updatedDetails.description,
				smoking_allowed: updatedDetails.smoking_allowed,
				bar_types: updatedDetails.bar_types
			});

			const response = await fetch(`/api/bars/${submissionBarId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					name: updatedDetails.name,
					address: updatedDetails.address,
					city: updatedDetails.city,
					phone: updatedDetails.phone,
					general_email: updatedDetails.email,
					opening_hours: updatedDetails.openingHours,
					description: updatedDetails.description,
					smoking_allowed: updatedDetails.smoking_allowed,
					bar_types: updatedDetails.bar_types
				})
			});

			console.log('Response status:', response.status);
			const responseData = await response.json();
			console.log('Response data:', responseData);

			if (response.ok) {
				barDetailsSuccess = responseData.message || 'Bar details updated successfully!';
				// Update the bar name in the UI if it changed
				if (updatedDetails.name !== barName) {
					barName = updatedDetails.name;
				}

				// Close modal after a delay
				setTimeout(() => {
					closeBarDetailsModal();
				}, 2000);
			} else {
				barDetailsError = responseData.message || 'Failed to update bar details';

				// Check for validation errors
				if (responseData.errors && Array.isArray(responseData.errors)) {
					barDetailsValidationErrors = responseData.errors;
				}
			}
		} catch (error: unknown) {
			console.error('Error updating bar details:', error);
			barDetailsError = error instanceof Error ? error.message : 'An unexpected error occurred';
		} finally {
			barDetailsLoading = false;
		}
	}

	function switchRole() {
		if (currentRole === 'bar') {
			goto('/promoter-home');
		} else {
			goto('/bars');
		}
	}
</script>

{#if showBarDetailsModal}
	<BarDetailsModal
		{barDetails}
		isLoading={barDetailsLoading}
		errorMessage={barDetailsError}
		validationErrors={barDetailsValidationErrors}
		successMessage={barDetailsSuccess}
		onclose={closeBarDetailsModal}
		onsubmit={handleBarDetailsSubmit}
	/>
{/if}

{#if error}
	<div class="error-message">
		<p>{error}</p>
	</div>
{/if}

<main class="dashboard-container">
	<header class="dashboard-header">
		<h1>{barName}'s Music Insights</h1>

		<div class="bar-attributes">
			{#if barDetails.smoking_allowed}
				<span class="attribute-badge smoking">🚬 Smoking Allowed</span>
			{/if}
			{#if barDetails.bar_types && barDetails.bar_types.length > 0}
				{#each barDetails.bar_types as type (type)}
					<span class="attribute-badge type">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
				{/each}
			{/if}
		</div>

		<p>Tell Clubfindr what you play and what is on, so the right people find you.</p>

		<div class="dashboard-actions">
			<button onclick={openBarDetailsModal} class="bar-details-btn"> Update Bar Details </button>
		</div>
	</header>

	{#if hasDualRole}
		<div class="role-switcher">
			<button onclick={switchRole} class="switcher-button">
				Switch to {currentRole === 'bar' ? 'Promoter' : 'Bar Manager'} Dashboard
			</button>
		</div>
	{/if}

	<VenueArtistsSection
		{barId}
		initialArtists={data.venueArtists ?? []}
		initialGenres={data.venueGenres ?? []}
	/>
	<VenueGenresSection {barId} initialGenres={data.declaredGenres ?? []} />
	<BarEventsSection {barId} />
</main>

<button onclick={toggleDebugInfo} class="debug-button">
	{showDebugInfo ? 'Hide Debug Info' : 'Show Debug Info'}
</button>

{#if showDebugInfo}
	<div class="debug-info">
		<h3>Debug Information</h3>

		<div class="manual-id-set">
			<input
				type="text"
				bind:value={manualBarId}
				placeholder="Enter bar ID manually"
				class="manual-id-input"
			/>
			<button onclick={setManualBarId} class="manual-id-button">Set ID</button>
		</div>

		<ul>
			<li>barId from page.js data: {barId || 'Not available'}</li>
			<li>barDetails.id: {barDetails.id || 'Not available'}</li>
			<li>Cookie barId: {getCookie('barId') || 'Not available'}</li>
			<li>Cookie barsName: {getCookie('barsName') || 'Not available'}</li>
			<li>Cookie bar_city: {getCookie('bar_city') || 'Not available'}</li>
		</ul>
	</div>
{/if}

<style>
	/* General Container */
	.dashboard-container {
		padding: 2rem;
	}

	/* Header Styles */
	.dashboard-header {
		text-align: center;
		margin-bottom: 2rem;
		font-size: 2.5rem;
		font-weight: bold;
	}

	.dashboard-header p {
		font-size: 1rem;
		margin-top: 0.5rem;
		color: #555;
	}

	.dashboard-actions {
		display: flex;
		justify-content: center;
		gap: 1rem;
		margin-top: 1rem;
	}

	.bar-attributes {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		margin: 0.5rem 0;
		flex-wrap: wrap;
	}

	.attribute-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-size: 0.8rem;
		font-weight: 500;
	}

	.attribute-badge.smoking {
		background-color: #ffebee;
		color: #c62828;
		border: 1px solid #ffcdd2;
	}

	.attribute-badge.type {
		background-color: #e3f2fd;
		color: #1565c0;
		border: 1px solid #bbdefb;
	}
	.error-message {
		background-color: #ffebee;
		color: #c62828;
		padding: 1rem;
		margin-bottom: 1rem;
		border-radius: 4px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.bar-details-btn {
		background-color: transparent;
		color: #2196f3;
		border: 1px solid #2196f3;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.bar-details-btn:hover {
		background-color: rgba(33, 150, 243, 0.1);
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
	/* Debug Styles */
	.debug-button {
		position: fixed;
		bottom: 20px;
		right: 20px;
		padding: 0.5rem 1rem;
		background-color: #f5f5f5;
		color: #333;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 0.8rem;
		z-index: 1000;
		opacity: 0.7;
	}

	.debug-button:hover {
		opacity: 1;
	}

	.debug-info {
		position: fixed;
		bottom: 70px;
		right: 20px;
		width: 400px;
		max-width: 90vw;
		padding: 1rem;
		background-color: #fff;
		border: 1px solid #ddd;
		border-radius: 4px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
		z-index: 999;
		font-family: monospace;
		font-size: 0.8rem;
	}

	.debug-info h3 {
		margin-top: 0;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid #eee;
	}

	.debug-info ul {
		padding-left: 1.5rem;
		margin: 0.5rem 0;
	}

	.manual-id-set {
		display: flex;
		margin-bottom: 1rem;
		gap: 0.5rem;
	}

	.manual-id-input {
		flex-grow: 1;
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-family: monospace;
	}

	.manual-id-button {
		padding: 0.5rem 1rem;
		background-color: #2196f3;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.manual-id-button:hover {
		background-color: #1976d2;
	}
</style>
