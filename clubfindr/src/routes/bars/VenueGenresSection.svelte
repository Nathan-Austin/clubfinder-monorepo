<!--
	The genres a venue declares outright, on the bar dashboard (ROADMAP section 1,
	KNOWN_ISSUES 4): "we play techno", with no artist needed.

	Edits PUT the whole set to /api/venues/:barId/taste/genres, which only accepts genres the
	cluster matcher knows — a declared genre exists solely to be matched. Suggestions come from
	the same unified-genres.json the search pickers use.
-->
<script lang="ts">
	interface Props {
		barId: string;
		/** From the page load, so the saved genres are on screen before anything fetches */
		initialGenres?: string[];
	}

	let { barId, initialGenres = [] }: Props = $props();

	// The page's data seeds the list once; the component owns it from then on (every save
	// stores the server's answer)
	// svelte-ignore state_referenced_locally
	let genres = $state<string[]>([...initialGenres]);
	let input = $state('');
	let saving = $state(false);
	let message = $state('');
	let suggestions = $state<string[]>([]);

	// The picker's own vocabulary, flattened: sub-cluster names and leaf genres. Loaded lazily;
	// the input works as free text until (and in case) it arrives.
	$effect(() => {
		fetch('/lib/unified-genres.json')
			.then((response) => (response.ok ? response.json() : null))
			.then((unified) => {
				if (!unified?.categories) return;
				const names = new Set<string>();
				for (const category of unified.categories) {
					for (const sub of category.subgenres ?? []) {
						if (sub.name) names.add(sub.name);
						for (const genre of sub.genres ?? []) names.add(genre);
						for (const subsub of sub.subsubgenres ?? []) {
							if (subsub.name) names.add(subsub.name);
							for (const genre of subsub.genres ?? []) names.add(genre);
						}
					}
				}
				suggestions = [...names].sort((a, b) => a.localeCompare(b));
			})
			.catch(() => {
				// Suggestions only; typing still works
			});
	});

	async function save(next: string[]) {
		saving = true;
		message = '';
		try {
			const response = await fetch(`/api/venues/${barId}/taste/genres`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ genres: next })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				message = body.message ?? 'Could not save the genres.';
				return;
			}
			genres = body.genres ?? next;
			input = '';
		} catch {
			message = 'Could not reach the server. Please try again.';
		} finally {
			saving = false;
		}
	}

	function addGenre(event: SubmitEvent) {
		event.preventDefault();
		const genre = input.trim();
		if (!genre || saving) return;
		if (genres.some((existing) => existing.toLowerCase() === genre.toLowerCase())) {
			input = '';
			return;
		}
		save([...genres, genre]);
	}

	function removeGenre(genre: string) {
		if (saving) return;
		save(genres.filter((existing) => existing !== genre));
	}
</script>

<section class="venue-genres" data-testid="venue-genres">
	<div class="venue-genres-head">
		<h2>Genres you play</h2>
		<p>
			Name the genres of your nights outright — no artist needed. They count towards matching
			exactly like the genres of your artists.
		</p>
	</div>

	<ul class="venue-genres-list" data-testid="venue-genres-list">
		{#each genres as genre (genre)}
			<li class="venue-genre">
				<span>{genre}</span>
				<button
					type="button"
					class="venue-genre-remove"
					aria-label={`Remove ${genre}`}
					disabled={saving}
					onclick={() => removeGenre(genre)}
				>
					×
				</button>
			</li>
		{:else}
			<li class="venue-genres-empty" data-testid="venue-genres-empty">
				No genres yet. Add the first one below.
			</li>
		{/each}
	</ul>

	<form class="venue-genres-form" onsubmit={addGenre}>
		<input
			type="text"
			list="venue-genre-suggestions"
			placeholder="e.g. techno, soul, uk garage…"
			bind:value={input}
			disabled={saving}
			data-testid="venue-genres-input"
		/>
		<datalist id="venue-genre-suggestions">
			{#each suggestions as suggestion (suggestion)}
				<option value={suggestion}></option>
			{/each}
		</datalist>
		<button type="submit" disabled={saving || !input.trim()} data-testid="venue-genres-add">
			{saving ? 'Saving…' : 'Add'}
		</button>
	</form>

	{#if message}
		<p class="venue-genres-error" role="alert" data-testid="venue-genres-error">{message}</p>
	{/if}
</section>

<style>
	/* Palette only: the --rgb-* triplets from app.css */
	.venue-genres {
		margin: 2rem 0;
		padding: 1.25rem 1.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
	}

	.venue-genres-head h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 0.25rem;
	}

	.venue-genres-head p {
		font-size: 0.9rem;
		color: rgba(var(--rgb-light), 0.75);
		margin: 0 0 0.75rem;
	}

	.venue-genres-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
	}

	.venue-genre {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.5rem 0.25rem 0.75rem;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 999px;
		font-size: 0.9rem;
	}

	.venue-genre-remove {
		border: none;
		background: none;
		color: rgba(var(--rgb-light), 0.7);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0.15rem;
	}

	.venue-genre-remove:hover {
		color: rgb(var(--rgb-primary));
	}

	.venue-genres-empty {
		font-size: 0.9rem;
		color: rgba(var(--rgb-light), 0.6);
	}

	.venue-genres-form {
		display: flex;
		gap: 0.5rem;
	}

	.venue-genres-form input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(0, 0, 0, 0.2);
		color: inherit;
	}

	.venue-genres-form button {
		padding: 0.5rem 1rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.1);
		color: inherit;
		cursor: pointer;
	}

	.venue-genres-form button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.venue-genres-error {
		margin: 0.75rem 0 0;
		font-size: 0.9rem;
		font-weight: 600;
		color: rgb(var(--rgb-primary));
	}
</style>
