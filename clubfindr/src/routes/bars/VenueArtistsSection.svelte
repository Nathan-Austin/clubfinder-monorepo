<!--
	The artists a venue says it plays, on the bar dashboard (ROADMAP section 1).

	The same ArtistPicker the users' taste profile and the signup onboarding use, pointed at
	/api/venues/:barId/taste. Their genres describe the venue by hand, so matching needs
	neither a venue Spotify connection nor barfindr polling its playback.
-->
<script lang="ts">
	import ArtistPicker, {
		type PickedArtist,
		type PickerState
	} from '$lib/components/ArtistPicker.svelte';

	interface Props {
		barId: string;
		/** From the page load, so the saved artists are on screen before the picker fetches */
		initialArtists?: PickedArtist[];
		initialGenres?: string[];
	}

	let { barId, initialArtists = [], initialGenres = [] }: Props = $props();

	// What the picker last reported; until it has loaded, the page's own data is shown
	let picked = $state<PickerState | null>(null);
	const savedCount = $derived((picked?.artists ?? initialArtists).length);
	const savedGenres = $derived(picked?.genres ?? initialGenres);
</script>

<section class="venue-artists" data-testid="venue-artists">
	<div class="venue-artists-head">
		<h2>Artists you play</h2>
		<p>
			Add the artists that describe your nights. Their genres are what Clubfindr matches people
			against, so this works without connecting any streaming account.
		</p>
	</div>

	{#if !barId}
		<p class="venue-artists-error" role="alert" data-testid="venue-artists-no-id">
			We could not tell which venue you are logged in as. Please log in again.
		</p>
	{:else}
		<ArtistPicker
			endpointBase={`/api/venues/${barId}/taste`}
			onChange={(state) => (picked = state)}
			favouritesLabel="Your artists"
			genresLabel="Genres people will find you by"
			searchPlaceholder="Search for an artist you play…"
			emptyText="No artists yet. Search above to add the first one."
		/>
		<p class="venue-artists-hint" data-testid="venue-artists-summary">
			{#if savedCount === 0}
				People searching for a genre will not match you on artists yet.
			{:else}
				{savedCount}
				{savedCount === 1 ? 'artist' : 'artists'}, {savedGenres.length}
				{savedGenres.length === 1 ? 'genre' : 'genres'}.
			{/if}
		</p>
	{/if}
</section>

<style>
	/* Palette only: the --rgb-* triplets from app.css */
	.venue-artists {
		margin: 2rem 0;
		padding: 1.25rem 1.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
	}

	.venue-artists-head h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 0.25rem;
	}

	.venue-artists-head p,
	.venue-artists-hint {
		font-size: 0.9rem;
		color: rgba(var(--rgb-light), 0.75);
		margin: 0 0 0.75rem;
	}

	.venue-artists-hint {
		margin: 1rem 0 0;
	}

	.venue-artists-error {
		font-size: 0.9rem;
		font-weight: 600;
		color: rgb(var(--rgb-primary));
	}
</style>
