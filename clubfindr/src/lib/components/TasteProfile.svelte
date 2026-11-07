<!--
	Favourite artists picker for the manual taste profile (docs/taste-profile-design.md).
	Shown on / for logged-in users. The picker itself is ArtistPicker.svelte (shared with the
	onboarding step and venue settings); this component is the card around it: the heading, and
	the two buttons that start a club or bar search with the profile's genres.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { toLocalIsoDate } from '$lib/localDate';
	import ArtistPicker, { type PickerState } from './ArtistPicker.svelte';

	interface Props {
		/** City chosen on the home page; searches need it (same rule as the genre picker) */
		city?: string;
		/** Date chosen on the home page */
		date?: Date;
		/** Called when a search is started without a city, so the page can flag its selector */
		onMissingCity?: () => void;
	}

	let { city = '', date = new Date(), onMissingCity }: Props = $props();

	let genres: string[] = $state([]);
	let loaded = $state(false);
	let error = $state('');
	let startingSearch = $state(false);

	function onPickerChange(state: PickerState) {
		genres = state.genres;
		loaded = state.loaded;
	}

	/**
	 * Starts a club or bar search with the taste profile: city and date go through /storestate
	 * like the genre picker's searches, but without a genre list, so /clubs and /barfindr fall
	 * back to the profile (picks for a search always win over the profile).
	 */
	async function findWithTaste(target: '/clubs' | '/barfindr') {
		if (!city) {
			onMissingCity?.();
			return;
		}
		startingSearch = true;
		error = '';
		try {
			const state = {
				city,
				formattedDate: toLocalIsoDate(date),
				source: 'taste-profile'
			};
			const response = await fetch('/storestate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ key: Date.now().toString(), state: JSON.stringify(state) })
			});
			if (!response.ok) throw new Error(`Could not start the search (${response.status})`);
			await goto(target);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not start the search';
		} finally {
			startingSearch = false;
		}
	}
</script>

<section
	id="taste-profile"
	class="taste-profile"
	data-testid="taste-profile"
	aria-labelledby="taste-profile-title"
>
	<h2 id="taste-profile-title" class="taste-title">Your taste profile</h2>
	<p class="taste-intro">
		Pick the artists you love. Their genres become your taste profile, no Spotify login needed.
	</p>

	<ArtistPicker onChange={onPickerChange} />

	{#if error}
		<p class="taste-error" role="alert">{error}</p>
	{/if}

	{#if loaded}
		<div class="taste-actions">
			<button
				type="button"
				class="taste-find"
				onclick={() => findWithTaste('/clubs')}
				disabled={genres.length === 0 || startingSearch}
				data-testid="taste-find-clubs"
			>
				Find clubs with my taste
			</button>
			<button
				type="button"
				class="taste-find"
				onclick={() => findWithTaste('/barfindr')}
				disabled={genres.length === 0 || startingSearch}
				data-testid="taste-find-bars"
			>
				Find bars with my taste
			</button>
		</div>
		<p class="taste-muted taste-actions-hint">
			{#if genres.length === 0}
				Add an artist first. Genres picked in the genre menu always take priority over your profile.
			{:else}
				Uses the city and date chosen above. Genres picked in the genre menu take priority over your
				profile.
			{/if}
		</p>
	{/if}
</section>

<style>
	/* Palette only: the --rgb-* triplets from app.css, plus white with alpha like .feature-card */
	.taste-profile {
		text-align: left;
		margin: 1.5rem auto 0;
		max-width: 600px;
		padding: 1.25rem 1.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
	}

	.taste-title {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 0.25rem;
	}

	.taste-intro,
	.taste-muted {
		font-size: 0.9rem;
		color: rgba(var(--rgb-light), 0.75);
		margin: 0 0 0.75rem;
	}

	.taste-error {
		font-size: 0.85rem;
		color: rgb(var(--rgb-primary));
		font-weight: 600;
		margin: 0.5rem 0 0;
	}

	.taste-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.25rem;
	}

	.taste-find {
		flex: 1 1 12rem;
		background: rgb(var(--rgb-secondary));
		color: white;
		border: none;
		border-radius: 0.5rem;
		padding: 0.7rem 1rem;
		font-weight: 600;
		cursor: pointer;
	}

	.taste-find:hover:not(:disabled) {
		opacity: 0.9;
	}

	.taste-find:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.taste-actions-hint {
		margin-top: 0.5rem;
		margin-bottom: 0;
	}
</style>
