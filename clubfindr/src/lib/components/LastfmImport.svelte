<!--
	Last.fm import for the taste profile (docs/taste-profile-design.md): a username, a period,
	one button. Talks to /api/taste/lastfm/import and shows what was imported, what was
	skipped, the resulting genres, and the API's own messages for failures.
-->
<script lang="ts">
	interface ImportedArtist {
		artist: { id: string; name: string; genres: string[] };
		created: boolean;
	}
	interface SkippedArtist {
		name: string;
		reason: string;
	}
	interface ImportResult {
		username: string;
		found: number;
		imported: ImportedArtist[];
		skipped: SkippedArtist[];
		withoutGenres: string[];
		genres: string[];
		warning?: string;
	}

	const PERIODS = [
		{ value: '12month', label: 'last 12 months' },
		{ value: '3month', label: 'last 3 months' },
		{ value: 'overall', label: 'all time' }
	];

	let username = $state('');
	let period = $state('12month');
	let importing = $state(false);
	let error = $state('');
	let result = $state<ImportResult | null>(null);

	let newArtists = $derived<ImportedArtist[]>(
		result ? result.imported.filter((i: ImportedArtist) => i.created) : []
	);
	let skippedByReason = $derived.by(() => {
		const groups = new Map<string, string[]>();
		for (const s of result?.skipped ?? []) {
			groups.set(s.reason, [...(groups.get(s.reason) ?? []), s.name]);
		}
		return [...groups.entries()];
	});

	async function runImport(event: SubmitEvent) {
		event.preventDefault();
		const name = username.trim();
		if (!name || importing) return;
		importing = true;
		error = '';
		result = null;
		try {
			const response = await fetch('/api/taste/lastfm/import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: name, period })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(body.message || `The import failed (${response.status}).`);
			}
			result = body as ImportResult;
		} catch (err) {
			error = err instanceof Error ? err.message : 'The import failed.';
		} finally {
			importing = false;
		}
	}
</script>

<form class="lastfm-import" onsubmit={runImport} data-testid="lastfm-import">
	<label class="lastfm-label" for="lastfm-username">Import from Last.fm</label>
	<p class="lastfm-hint">
		Your top artists on Last.fm become favourite artists; their tags become your genres.
	</p>
	<div class="lastfm-row">
		<input
			id="lastfm-username"
			class="lastfm-input"
			type="text"
			placeholder="Last.fm username"
			autocomplete="off"
			bind:value={username}
			disabled={importing}
			data-testid="lastfm-username"
		/>
		<select class="lastfm-select" bind:value={period} disabled={importing} aria-label="Period">
			{#each PERIODS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		<button
			type="submit"
			class="lastfm-button"
			disabled={importing || !username.trim()}
			data-testid="lastfm-submit"
		>
			{importing ? 'Importing…' : 'Import'}
		</button>
	</div>

	{#if error}
		<p class="lastfm-error" role="alert" data-testid="lastfm-error">{error}</p>
	{/if}

	{#if result}
		<div class="lastfm-result" role="status" data-testid="lastfm-result">
			<p class="lastfm-summary">
				{#if newArtists.length === 0}
					No new favourite artists from <strong>{result.username}</strong>
					({result.found} top artists checked).
				{:else}
					Imported <strong>{newArtists.length}</strong>
					{newArtists.length === 1 ? 'artist' : 'artists'} from
					<strong>{result.username}</strong>: {newArtists
						.map((i: ImportedArtist) => i.artist.name)
						.join(', ')}.
				{/if}
			</p>
			{#if result.warning}
				<p class="lastfm-warning">{result.warning}</p>
			{/if}
			{#each skippedByReason as [reason, names] (reason)}
				<p class="lastfm-skipped">
					Skipped ({reason}): {names.join(', ')}
				</p>
			{/each}
			{#if result.withoutGenres.length > 0}
				<p class="lastfm-skipped">
					No recognisable genres for: {result.withoutGenres.join(', ')}
				</p>
			{/if}
			<p class="lastfm-genres">
				Your genres now ({result.genres.length}): {result.genres.join(', ') || 'none yet'}
			</p>
			<a class="lastfm-link" href="/#taste-profile">Review your favourite artists</a>
		</div>
	{/if}
</form>

<style>
	.lastfm-import {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(var(--rgb-light), 0.2);
		text-align: left;
	}

	.lastfm-label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.25rem;
		color: rgb(var(--rgb-light));
	}

	.lastfm-hint,
	.lastfm-skipped,
	.lastfm-genres {
		font-size: 0.85rem;
		color: rgba(var(--rgb-light), 0.75);
		margin: 0 0 0.5rem;
	}

	.lastfm-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.lastfm-input,
	.lastfm-select {
		flex: 1 1 9rem;
		min-width: 0;
		height: 2.5rem;
		padding: 0 0.75rem;
		border: none;
		border-radius: 0.375rem;
		background: white;
		color: rgb(var(--rgb-text-dark));
	}

	.lastfm-input:focus,
	.lastfm-select:focus {
		outline: 2px solid rgb(var(--rgb-secondary));
	}

	.lastfm-button {
		flex: 0 0 auto;
		height: 2.5rem;
		padding: 0 1rem;
		border: none;
		border-radius: 0.375rem;
		background: rgb(var(--rgb-secondary));
		color: white;
		font-weight: 600;
		cursor: pointer;
	}

	.lastfm-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.lastfm-error,
	.lastfm-warning {
		font-size: 0.85rem;
		color: rgb(var(--rgb-primary));
		margin: 0.5rem 0 0;
	}

	.lastfm-error {
		font-weight: 600;
	}

	.lastfm-result {
		margin-top: 0.75rem;
		padding: 0.75rem;
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
	}

	.lastfm-summary {
		margin: 0 0 0.5rem;
	}

	.lastfm-link {
		color: rgb(var(--rgb-light));
		text-decoration: underline;
		font-size: 0.9rem;
	}
</style>
