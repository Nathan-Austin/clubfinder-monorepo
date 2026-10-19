<!--
	Favourite artists picker for the manual taste profile (docs/taste-profile-design.md).
	Shown on / for logged-in users. Talks to /api/taste/search and /api/taste/artists; the
	genre profile it shows is the plain set of the favourites' genres, as returned by the API.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toLocalIsoDate } from '$lib/localDate';

	interface Props {
		/** City chosen on the home page; searches need it (same rule as the genre picker) */
		city?: string;
		/** Date chosen on the home page */
		date?: Date;
		/** Called when a search is started without a city, so the page can flag its selector */
		onMissingCity?: () => void;
	}

	let { city = '', date = new Date(), onMissingCity }: Props = $props();

	interface Artist {
		id: string;
		source: string;
		sourceId: string;
		name: string;
		genres: string[];
		imageUrl: string | null;
	}

	interface SearchHit {
		source: string;
		sourceId: string;
		name: string;
		genres: string[];
		imageUrl: string | null;
		favourite: boolean;
		catalogueId: string | null;
	}

	const SEARCH_DEBOUNCE_MS = 300;
	const MIN_QUERY_LENGTH = 2;

	let artists: Artist[] = $state([]);
	let genres: string[] = $state([]);
	let loading = $state(true);
	let error = $state('');

	let query = $state('');
	let results: SearchHit[] = $state([]);
	let searching = $state(false);
	let searched = $state(false);
	let warning = $state('');
	let busy = $state(new Set<string>()); // "source:sourceId" of artists being added/removed

	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let latestSearch = 0;

	const keyOf = (artist: { source: string; sourceId: string }) =>
		`${artist.source}:${artist.sourceId}`;

	onMount(loadProfile);

	async function loadProfile() {
		loading = true;
		error = '';
		try {
			const response = await fetch('/api/taste/artists');
			if (!response.ok)
				throw new Error(`Could not load your favourite artists (${response.status})`);
			const profile = await response.json();
			artists = profile.artists;
			genres = profile.genres;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not load your favourite artists';
		} finally {
			loading = false;
		}
	}

	function onQueryInput() {
		clearTimeout(searchTimer);
		const value = query.trim();
		if (value.length < MIN_QUERY_LENGTH) {
			results = [];
			searched = false;
			warning = '';
			return;
		}
		searchTimer = setTimeout(() => search(value), SEARCH_DEBOUNCE_MS);
	}

	async function search(value: string) {
		const id = ++latestSearch;
		searching = true;
		try {
			const response = await fetch(`/api/taste/search?q=${encodeURIComponent(value)}`);
			if (id !== latestSearch) return; // a newer search is in flight
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(body.message || `Search failed (${response.status})`);
			}
			const data = await response.json();
			results = data.artists;
			warning = data.warning ?? '';
			error = '';
			searched = true;
		} catch (err) {
			if (id !== latestSearch) return;
			error = err instanceof Error ? err.message : 'Search failed';
			results = [];
			searched = true;
		} finally {
			if (id === latestSearch) searching = false;
		}
	}

	function setBusy(key: string, value: boolean) {
		const next = new Set(busy);
		if (value) next.add(key);
		else next.delete(key);
		busy = next;
	}

	async function addArtist(hit: SearchHit) {
		const key = keyOf(hit);
		if (busy.has(key)) return;
		setBusy(key, true);
		error = '';
		try {
			const response = await fetch('/api/taste/artists', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ source: hit.source, sourceId: hit.sourceId })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.message || `Could not add ${hit.name}`);
			if (body.created) artists = [...artists, body.artist];
			genres = body.genres;
			results = results.map((r) =>
				keyOf(r) === key ? { ...r, favourite: true, catalogueId: body.artist.id } : r
			);
		} catch (err) {
			error = err instanceof Error ? err.message : `Could not add ${hit.name}`;
		} finally {
			setBusy(key, false);
		}
	}

	async function removeArtist(artist: Artist) {
		const key = keyOf(artist);
		if (busy.has(key)) return;
		setBusy(key, true);
		error = '';
		try {
			const response = await fetch(`/api/taste/artists/${artist.id}`, { method: 'DELETE' });
			const body = await response.json().catch(() => ({}));
			if (!response.ok && response.status !== 404) {
				throw new Error(body.message || `Could not remove ${artist.name}`);
			}
			artists = artists.filter((a) => a.id !== artist.id);
			if (Array.isArray(body.genres)) genres = body.genres;
			results = results.map((r) => (keyOf(r) === key ? { ...r, favourite: false } : r));
		} catch (err) {
			error = err instanceof Error ? err.message : `Could not remove ${artist.name}`;
		} finally {
			setBusy(key, false);
		}
	}

	let startingSearch = $state(false);

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

	function clearSearch() {
		clearTimeout(searchTimer);
		latestSearch += 1;
		query = '';
		results = [];
		searched = false;
		searching = false;
		warning = '';
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

	<div class="taste-search">
		<label class="sr-only" for="taste-search-input">Search for an artist</label>
		<input
			id="taste-search-input"
			type="text"
			class="taste-input text-black"
			placeholder="Search for an artist…"
			autocomplete="off"
			bind:value={query}
			oninput={onQueryInput}
			data-testid="taste-search"
		/>
		{#if query}
			<button type="button" class="taste-clear" onclick={clearSearch} aria-label="Clear search">
				✖
			</button>
		{/if}
	</div>

	{#if warning}
		<p class="taste-warning" role="status">{warning}</p>
	{/if}
	{#if error}
		<p class="taste-error" role="alert">{error}</p>
	{/if}

	{#if searching}
		<p class="taste-muted" role="status">Searching…</p>
	{:else if searched}
		{#if results.length === 0}
			<p class="taste-muted" data-testid="taste-no-results">No artists found for “{query}”.</p>
		{:else}
			<ul class="taste-results" aria-label="Search results">
				{#each results as hit (keyOf(hit))}
					<li class="taste-result" data-testid="taste-result">
						{#if hit.imageUrl}
							<img class="taste-avatar" src={hit.imageUrl} alt="" />
						{:else}
							<span class="taste-avatar taste-avatar-empty" aria-hidden="true">♪</span>
						{/if}
						<div class="taste-result-text">
							<span class="taste-result-name">{hit.name}</span>
							<span class="taste-result-genres">
								{hit.genres.length ? hit.genres.join(', ') : 'no genres listed'}
							</span>
						</div>
						{#if hit.favourite}
							<span class="taste-added">Added</span>
						{:else}
							<button
								type="button"
								class="taste-add"
								onclick={() => addArtist(hit)}
								disabled={busy.has(keyOf(hit))}
								aria-label={`Add ${hit.name}`}
							>
								Add
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<h3 class="taste-subtitle">
		Favourite artists
		{#if !loading}<span class="taste-count">({artists.length})</span>{/if}
	</h3>
	{#if loading}
		<p class="taste-muted" role="status">Loading…</p>
	{:else if artists.length === 0}
		<p class="taste-muted" data-testid="taste-empty">
			No favourite artists yet. Search above to add the first one.
		</p>
	{:else}
		<ul class="taste-favourites" aria-label="Favourite artists">
			{#each artists as artist (artist.id)}
				<li class="taste-favourite" data-testid="taste-favourite">
					<span class="taste-favourite-name">{artist.name}</span>
					<button
						type="button"
						class="taste-remove"
						onclick={() => removeArtist(artist)}
						disabled={busy.has(keyOf(artist))}
						aria-label={`Remove ${artist.name}`}
						title="Remove"
					>
						✖
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<h3 class="taste-subtitle">
		Your genres
		{#if !loading}<span class="taste-count">({genres.length})</span>{/if}
	</h3>
	{#if !loading}
		{#if genres.length === 0}
			<p class="taste-muted">Add an artist and its genres show up here.</p>
		{:else}
			<ul class="taste-genres" aria-label="Your genres" data-testid="taste-genres">
				{#each genres as genre (genre)}
					<li class="taste-genre" data-testid="taste-genre">{genre}</li>
				{/each}
			</ul>
		{/if}

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

	.taste-search {
		position: relative;
	}

	.taste-input {
		width: 100%;
		height: 3rem;
		padding: 0 2.5rem 0 1rem;
		border-radius: 0.5rem;
		border: none;
		background: white;
	}

	.taste-input:focus {
		outline: 2px solid rgb(var(--rgb-secondary));
	}

	.taste-clear {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		cursor: pointer;
		color: rgb(var(--rgb-text-dark));
	}

	.taste-warning {
		font-size: 0.85rem;
		color: rgb(var(--rgb-primary));
		margin: 0.5rem 0 0;
	}

	.taste-error {
		font-size: 0.85rem;
		color: rgb(var(--rgb-primary));
		font-weight: 600;
		margin: 0.5rem 0 0;
	}

	.taste-results {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.taste-result {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.04);
	}

	.taste-result + .taste-result {
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}

	.taste-avatar {
		flex: 0 0 2.5rem;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		object-fit: cover;
		background: rgba(var(--rgb-secondary), 0.4);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.taste-result-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.taste-result-name {
		font-weight: 600;
	}

	.taste-result-genres {
		font-size: 0.8rem;
		color: rgba(var(--rgb-light), 0.7);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.taste-add {
		background: rgb(var(--rgb-secondary));
		color: white;
		border: none;
		border-radius: 0.375rem;
		padding: 0.4rem 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}

	.taste-add:hover:not(:disabled) {
		opacity: 0.9;
	}

	.taste-add:disabled,
	.taste-remove:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	.taste-added {
		font-size: 0.85rem;
		color: rgba(var(--rgb-light), 0.7);
	}

	.taste-subtitle {
		font-size: 1rem;
		font-weight: 600;
		margin: 1.25rem 0 0.5rem;
	}

	.taste-count {
		font-weight: 400;
		color: rgba(var(--rgb-light), 0.7);
	}

	.taste-favourites,
	.taste-genres {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.taste-favourite {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.5rem 0.35rem 0.85rem;
		border-radius: 999px;
		background: rgb(var(--rgb-secondary));
		color: white;
		font-size: 0.9rem;
	}

	.taste-remove {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		font-size: 0.75rem;
		line-height: 1;
		padding: 0.25rem;
		border-radius: 50%;
	}

	.taste-remove:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
	}

	.taste-genre {
		padding: 0.3rem 0.75rem;
		border-radius: 999px;
		border: 1px solid rgba(var(--rgb-light), 0.4);
		font-size: 0.85rem;
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
