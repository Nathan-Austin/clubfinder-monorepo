<!--
	Shared artist picker: search a provider-backed catalogue, add and remove artists, show the
	genres they imply (docs/taste-profile-design.md).

	Extracted from TasteProfile.svelte so the same control can serve the user taste profile,
	the signup onboarding step (3-5 artists) and the venue settings page. It owns nothing but
	the picker itself: the surrounding card, headings and call-to-action buttons belong to the
	caller, which gets the current state through `onChange`.

	The endpoints behind `endpointBase` must follow the /api/taste shape:
	  GET    {base}/search?q=<name>   -> { artists: SearchHit[], warning? }
	  GET    {base}/artists           -> { artists: PickedArtist[], genres: string[] }
	  POST   {base}/artists           -> { artist, created, genres }
	  DELETE {base}/artists/{id}      -> { genres }
-->
<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	export interface PickedArtist {
		id: string;
		source: string;
		sourceId: string;
		name: string;
		genres: string[];
		imageUrl: string | null;
	}

	export interface SearchHit {
		source: string;
		sourceId: string;
		name: string;
		genres: string[];
		imageUrl: string | null;
		favourite: boolean;
		catalogueId: string | null;
	}

	/** What the caller is told after every load, add or remove. */
	export interface PickerState {
		artists: PickedArtist[];
		genres: string[];
		/** False until the first load has finished (success or failure). */
		loaded: boolean;
		/** artists.length >= min. `max` does not affect it: more artists never make it incomplete. */
		complete: boolean;
	}

	interface Props {
		/** Endpoint prefix; see the shape documented above. */
		endpointBase?: string;
		/** Fewest artists the caller needs before it considers the picker complete. */
		min?: number;
		/**
		 * Advisory cap for this screen: at `max` the Add buttons are disabled and `atMaxNote` is
		 * shown. Not enforced by the server, and artists already above it (added elsewhere) stay.
		 * null for "no limit beyond the server's".
		 */
		max?: number | null;
		/** Replaces the default note shown at the cap (e.g. to point at where to add more). */
		atMaxNote?: Snippet;
		/** Show the derived genre list under the favourites. */
		showGenres?: boolean;
		/** Called after every load, add and remove. */
		onChange?: (state: PickerState) => void;
		searchLabel?: string;
		searchPlaceholder?: string;
		favouritesLabel?: string;
		genresLabel?: string;
		emptyText?: string;
		/** Rendered at the end of the picker, inside its container. */
		footer?: Snippet<[PickerState]>;
	}

	let {
		endpointBase = '/api/taste',
		min = 0,
		max = null,
		atMaxNote,
		showGenres = true,
		onChange,
		searchLabel = 'Search for an artist',
		searchPlaceholder = 'Search for an artist…',
		favouritesLabel = 'Favourite artists',
		genresLabel = 'Your genres',
		emptyText = 'No favourite artists yet. Search above to add the first one.',
		footer
	}: Props = $props();

	const SEARCH_DEBOUNCE_MS = 300;
	const MIN_QUERY_LENGTH = 2;

	let artists: PickedArtist[] = $state([]);
	let genres: string[] = $state([]);
	let loading = $state(true);
	let loaded = $state(false);
	let error = $state('');

	let query = $state('');
	let results: SearchHit[] = $state([]);
	let searching = $state(false);
	let searched = $state(false);
	let warning = $state('');
	let busy = $state(new Set<string>()); // "source:sourceId" of artists being added/removed

	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let latestSearch = 0;

	const atMax = $derived(max !== null && artists.length >= max);
	const pickerState = $derived<PickerState>({
		artists,
		genres,
		loaded,
		complete: artists.length >= min
	});

	const keyOf = (artist: { source: string; sourceId: string }) =>
		`${artist.source}:${artist.sourceId}`;

	onMount(loadProfile);

	function notify() {
		onChange?.(pickerState);
	}

	async function loadProfile() {
		loading = true;
		error = '';
		try {
			const response = await fetch(`${endpointBase}/artists`);
			if (!response.ok)
				throw new Error(`Could not load your favourite artists (${response.status})`);
			const profile = await response.json();
			artists = profile.artists;
			genres = profile.genres;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not load your favourite artists';
		} finally {
			loading = false;
			loaded = true;
			notify();
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
			const response = await fetch(`${endpointBase}/search?q=${encodeURIComponent(value)}`);
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
		if (busy.has(key) || atMax) return;
		setBusy(key, true);
		error = '';
		try {
			const response = await fetch(`${endpointBase}/artists`, {
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
			notify();
		} catch (err) {
			error = err instanceof Error ? err.message : `Could not add ${hit.name}`;
		} finally {
			setBusy(key, false);
		}
	}

	async function removeArtist(artist: PickedArtist) {
		const key = keyOf(artist);
		if (busy.has(key)) return;
		setBusy(key, true);
		error = '';
		try {
			const response = await fetch(`${endpointBase}/artists/${artist.id}`, { method: 'DELETE' });
			const body = await response.json().catch(() => ({}));
			if (!response.ok && response.status !== 404) {
				throw new Error(body.message || `Could not remove ${artist.name}`);
			}
			artists = artists.filter((a) => a.id !== artist.id);
			if (Array.isArray(body.genres)) genres = body.genres;
			results = results.map((r) => (keyOf(r) === key ? { ...r, favourite: false } : r));
			notify();
		} catch (err) {
			error = err instanceof Error ? err.message : `Could not remove ${artist.name}`;
		} finally {
			setBusy(key, false);
		}
	}

	export function clearSearch() {
		clearTimeout(searchTimer);
		latestSearch += 1;
		query = '';
		results = [];
		searched = false;
		searching = false;
		warning = '';
	}
</script>

<div class="taste-picker" data-testid="artist-picker">
	<div class="taste-search">
		<label class="sr-only" for="taste-search-input">{searchLabel}</label>
		<input
			id="taste-search-input"
			type="text"
			class="taste-input text-black"
			placeholder={searchPlaceholder}
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
	{#if atMax}
		<div class="taste-muted" data-testid="taste-at-max" role="status">
			{#if atMaxNote}
				{@render atMaxNote()}
			{:else}
				That is {max} artists, the most this step takes. Remove one to swap it for another.
			{/if}
		</div>
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
								disabled={busy.has(keyOf(hit)) || atMax}
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
		{favouritesLabel}
		{#if !loading}<span class="taste-count">({artists.length})</span>{/if}
	</h3>
	{#if loading}
		<p class="taste-muted" role="status">Loading…</p>
	{:else if artists.length === 0}
		<p class="taste-muted" data-testid="taste-empty">{emptyText}</p>
	{:else}
		<ul class="taste-favourites" aria-label={favouritesLabel}>
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

	{#if showGenres}
		<h3 class="taste-subtitle">
			{genresLabel}
			{#if !loading}<span class="taste-count">({genres.length})</span>{/if}
		</h3>
		{#if !loading}
			{#if genres.length === 0}
				<p class="taste-muted">Add an artist and its genres show up here.</p>
			{:else}
				<ul class="taste-genres" aria-label={genresLabel} data-testid="taste-genres">
					{#each genres as genre (genre)}
						<li class="taste-genre" data-testid="taste-genre">{genre}</li>
					{/each}
				</ul>
			{/if}
		{/if}
	{/if}

	{#if footer}{@render footer(pickerState)}{/if}
</div>

<style>
	/* Palette only: the --rgb-* triplets from app.css, plus white with alpha like .feature-card */
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
</style>
