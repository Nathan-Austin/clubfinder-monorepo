<!--
	Artist picker onboarding: the user names 3-5 artists and their genres seed the taste profile
	(ROADMAP section 1). Search goes through /api/taste/search, i.e. the server-side Spotify app
	(src/lib/taste/spotifyArtistLookup.ts); no streaming account is involved.

	The 5 is a quick-start cap for this screen only. The note shown at the cap sends the user to
	the taste profile on /, which takes many more, and to the Last.fm import on /users-home.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import ArtistPicker, { type PickerState } from '$lib/components/ArtistPicker.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let count = $state(0);
	let complete = $state(false);
	let continuing = $state(false);

	function onPickerChange(state: PickerState) {
		count = state.artists.length;
		complete = state.complete;
	}

	async function finish() {
		continuing = true;
		await goto('/users-home');
	}
</script>

<svelte:head>
	<title>Pick your artists | Clubfindr</title>
</svelte:head>

<main class="onboarding" data-testid="onboarding">
	<h1 class="onboarding-title">Pick {data.min} to {data.max} artists you love</h1>
	<p class="onboarding-intro">
		Their genres become your taste profile, so we can find nights that suit you. No Spotify or other
		streaming account needed.
	</p>

	<p class="onboarding-progress" data-testid="onboarding-progress" aria-live="polite">
		{#if complete}
			{count} picked. You are good to go.
		{:else}
			{count} of {data.min} picked
		{/if}
	</p>

	<ArtistPicker
		min={data.min}
		max={data.max}
		onChange={onPickerChange}
		favouritesLabel="Your artists"
		emptyText="No artists yet. Search above and add your first one."
	>
		{#snippet atMaxNote()}
			That is plenty to get started. You can add as many more as you like later in
			<a href="/#taste-profile">your taste profile</a>, or import your listening history from
			Last.fm on <a href="/users-home">your account page</a>.
		{/snippet}
	</ArtistPicker>

	<div class="onboarding-actions">
		<button
			type="button"
			class="onboarding-continue"
			onclick={finish}
			disabled={!complete || continuing}
			data-testid="onboarding-continue"
		>
			Continue
		</button>
		<a href="/users-home" class="onboarding-skip" data-testid="onboarding-skip">Skip for now</a>
	</div>
</main>

<style>
	/* Palette only: the --rgb-* triplets from app.css, plus white with alpha like .feature-card */
	.onboarding {
		text-align: left;
		margin: 2rem auto;
		max-width: 600px;
		padding: 1.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
	}

	.onboarding-title {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 0.5rem;
	}

	.onboarding-intro,
	.onboarding-progress {
		font-size: 0.95rem;
		color: rgba(var(--rgb-light), 0.75);
		margin: 0 0 1rem;
	}

	.onboarding-progress {
		font-weight: 600;
	}

	.onboarding :global(.taste-muted a) {
		text-decoration: underline;
	}

	.onboarding-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	.onboarding-continue {
		flex: 1 1 auto;
		background: rgb(var(--rgb-secondary));
		color: white;
		border: none;
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		font-weight: 600;
		cursor: pointer;
	}

	.onboarding-continue:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.onboarding-skip {
		font-size: 0.9rem;
		color: rgba(var(--rgb-light), 0.75);
		text-decoration: underline;
	}
</style>
