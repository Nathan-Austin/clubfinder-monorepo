<script lang="ts">
	import type { SimilarityResult } from '$lib/$types';
	import { fromLocalIsoDate } from '$lib/localDate';
	let { data } = $props();

	const city = $derived(data.props.city || 'Unknown City'); // Default value if city is undefined
	const capitalizedCity = $derived(city.charAt(0).toUpperCase() + city.slice(1).toLowerCase());
	const newdate = $derived(data.props.date);
	const address: string | undefined = $derived(data.props.address);
	const isLoggedIn: boolean = $derived(data.props.isLoggedIn ?? false);
	let showMore = $state(false);
	let options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
	let formattedDate = $derived(
		new Intl.DateTimeFormat('en-US', options).format(
			newdate ? fromLocalIsoDate(newdate) : new Date()
		)
	);
	let selectedDate = $state('');
	let SimilarityResults: SimilarityResult[] = $derived(data.props.serverSimilarityResults ?? []);
	let displayCount = $state(6); // Initial number of results to display
	const incrementAmount = 4; // Number of additional results to show when clicking "Show More"

	// Function to handle showing more results
	function handleShowMore() {
		displayCount += incrementAmount;
	}

	// Calculate whether there are more results to show
	let hasMoreResults = $derived(SimilarityResults.length > displayCount);

	// Get the currently visible results
	let visibleResults = $derived(SimilarityResults.slice(0, displayCount));

	function generateGoogleMapsLink(destination: string, origin?: string) {
		if (origin) {
			// If the user's address is provided, include it as the origin
			return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
				origin
			)}&destination=${encodeURIComponent(destination)}`;
		} else {
			// If no user's address, just show the destination
			return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
		}
	}
	function goBack() {
		// Option A: Go back to the previous page
		window.history.back();

		// Option B: Navigate to a specific route
		// goto('/previousRoute');
	}

	let isInterested = $state(false); // Track the interest state for each event

	async function markAsInterested(eventId: number) {
		try {
			// Send the event ID to your backend to mark it as "interested"
			const response = await fetch('/api/mark-interested', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ eventId: eventId.toString() })
			});

			if (response.ok) {
				isInterested = true; // Mark as interested when the API call succeeds
				console.log('marked as interested');
			} else {
				console.error('Failed to mark event as interested');
			}
		} catch (error) {
			console.error('Error marking event as interested:', error);
		}
	}

	function resetInterest() {
		isInterested = false; // Reset the interest state
	}
</script>

<svelte:head>
	<title>Clubs in {capitalizedCity} - Find Music Events That Match Your Style | ClubFindr</title>
	<meta
		name="description"
		content="Discover clubs and music events in {capitalizedCity} that match your music taste. Find parties, check ticket prices, and get directions to venues playing your favorite genres."
	/>
	<meta
		name="keywords"
		content="clubs {capitalizedCity}, nightlife, music events, electronic music, club finder, nightclub events, {capitalizedCity} nightlife"
	/>

	<!-- Open Graph -->
	<meta
		property="og:title"
		content="Clubs in {capitalizedCity} - Find Music Events That Match Your Style | ClubFindr"
	/>
	<meta
		property="og:description"
		content="Discover clubs and music events in {capitalizedCity} that match your music taste. Find parties and venues playing your favorite genres."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://clubfindr.com/clubs" />

	<!-- Twitter -->
	<meta name="twitter:title" content="Clubs in {capitalizedCity} - ClubFindr" />
	<meta
		name="twitter:description"
		content="Find clubs and music events in {capitalizedCity} that match your music taste."
	/>

	<!-- Additional SEO -->
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href="https://clubfindr.com/clubs" />
</svelte:head>

<div class="header mt-2 md:mt-16">
	<h1
		class="text-4xl md:text-8xl font-bold my-2 md:my-4 text-transparent bg-clip-text bg-linear-to-br from-light via-light to-secondary"
	>
		ClubFinder {capitalizedCity}
	</h1>
	<p class="text-l md:text-xl mb-4">Your style of music every time</p>
	<p class="text-l md:text-xl mb-4">Found parties matching your music style for {formattedDate}</p>

	<!-- Flex container to align the button and form horizontally -->
	<div class="flex flex-col md:flex-row items-center mt-6">
		<button type="button" class="back-button mr-4" onclick={goBack}>Change the vibe</button>
		<form method="GET" data-sveltekit-reload class="flex items-center">
			<div class="date-input-container">
				<input type="date" name="date" bind:value={selectedDate} required style="color: black;" />
			</div>
			<button type="submit" class="ml-2">Change Date</button>
		</form>
	</div>
</div>

<div class="body">
	{#if SimilarityResults.length === 0}
		<div class="no-results">
			<p>
				Sorry, we couldn't find any matches for your choice, try something else by clicking Change
				The Vibe
			</p>
		</div>
	{:else}
		<div class="poster-container">
			{#each visibleResults as result (result.event_id)}
				<div class="poster">
					<div class="flyer-container">
						{#if result.event_image && result.event_image.trim() !== '' && result.event_image !== 'Event flyerfront image not available'}
							<img src={result.event_image} alt="Event flyer" />
						{:else}
							<!-- svelte-ignore a11y_img_redundant_alt -->
							<img src="/images/static_ella.jpg" alt="Placeholder image" />
						{/if}
					</div>
					<div class="info-container">
						<div class="item">
							<div class="label">Club:</div>
							<div class="value club-value">
								<span>{result.club_name}</span>
								<a
									href={generateGoogleMapsLink(result.club_address, address)}
									target="_blank"
									class="location-icon"
									rel="noopener noreferrer"
									onclick={() => markAsInterested(result.event_id)}
								>
									<img src="/images/pin-location-icon.jpg" alt="Location Marker" />
								</a>
							</div>
						</div>

						<div class="item">
							<div class="label">Event:</div>
							<div class="value">
								<a
									href={`https://ra.co/events/${result.event_id}`}
									target="_blank"
									rel="noopener noreferrer"
									class="event-link"
									onclick={() => markAsInterested(result.event_id)}
								>
									{result.event_name}
								</a>
							</div>
						</div>

						<div class="item">
							<div class="label">Tickets:</div>
							<div class="value">
								{#if !result.price || result.price === 0}
									Tickets not available. Sold out or Free party
								{:else}
									€{result.price}
								{/if}
							</div>
						</div>
						{#if isLoggedIn}
							<div class="item">
								<div class="label">Interested ?:</div>
								<div class="value">
									<!-- Always show both the tick and the cross initially -->
									{#if isInterested}
										<!-- When interested is selected, show the tick and the cross to undo -->
										<span class="interest-icon green-tick">✅</span>
										<button class="red-cross" onclick={resetInterest}>❌</button>
									{:else}
										<!-- Show tick and cross before selecting interest -->
										<button class="green-tick" onclick={() => markAsInterested(result.event_id)}
											>✅</button
										>
										<button class="red-cross" onclick={resetInterest}>❌</button>
									{/if}
								</div>
							</div>
						{/if}
						<div class="item">
							<div class="label">Interested:</div>
							<div class="value">{result.popularity}</div>
						</div>

						<div class="item">
							<div class="value genres-container">
								<div class="genres-header">Matching Genres:</div>
								<div class="genres-columns">
									{#each result.genres.slice(0, showMore ? result.genres.length : 5) as genre, i (i)}
										<div class="genre-item">{genre}</div>
									{/each}
								</div>
								{#if result.genres.length > 5}
									<button onclick={() => (showMore = !showMore)} class="show-more-button">
										{showMore ? 'Show Less' : 'Show More'}
									</button>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
		{#if hasMoreResults}
			<button onclick={handleShowMore} class="show-more-results-button"> Show More Results </button>
		{/if}

		<p class="mt-4">Please note: Online ticket sales finish at 10pm the day of the party</p>
	{/if}
</div>

<style>
	.header {
		position: relative;
		top: 0;
		z-index: 1;
		padding: 0.1rem;
		background-color: rgba(122, 214, 236, 0.788);
		backdrop-filter: blur(5px);
		text-align: center;
	}

	.body {
		background-image: url('/images/brickwall.jpg');
		background-position: center center;
		background-repeat: no-repeat;
		background-size: cover;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.poster-container {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		grid-gap: 2em;
		width: 100%;
		max-width: 1200px;
		margin: 3em auto;
	}

	.poster {
		display: grid;
		grid-template-rows: auto 1fr;
		gap: 1em;
		margin: 0;
		padding: 2em;
		background-color: rgba(202, 186, 142, 0.65);
		border-radius: 5px;
		box-shadow: 0 10px 15px rgba(0, 0, 0, 0.3);
		border-color: rgb(192, 209, 224);
		border-width: 5px;
		position: relative;
	}

	.flyer-container {
		position: relative;
		width: 100%;
		overflow: hidden;
	}

	.flyer-container::before {
		content: '';
		display: block;
		padding-top: 100%; /* 1:1 Aspect Ratio */
	}

	.flyer-container img {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.info-container {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}
	.no-results {
		text-align: center;
		padding: 2em;
		margin: 2em auto;
		background-color: rgba(202, 186, 142, 0.65);
		border-radius: 5px;
		box-shadow: 0 10px 15px rgba(0, 0, 0, 0.3);
		border: 5px solid rgb(192, 209, 224);
		max-width: 600px;
	}

	.no-results p {
		font-size: 1.2rem;
		color: black;
		line-height: 1.5;
	}

	.item {
		display: flex;
		align-items: flex-start;
		flex-wrap: wrap;
		color: black;
	}

	.label {
		font-weight: bold;
		margin-right: 1em;
		color: darkblue;
	}

	.value {
		flex: 1;
		word-wrap: break-word;
	}
	.club-value {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.club-value span {
		flex: 1;
	}

	.location-icon img {
		width: 25px;
		height: 25px;
		margin-left: 10px;
	}
	/* Style the event link */
	.event-link {
		text-decoration: underline;
		color: inherit; /* Optional: Keeps the link color the same as surrounding text */
	}

	.event-link:hover {
		color: blue; /* Optional: Changes color on hover to indicate interactivity */
	}
	.date-input-container input[type='date'] {
		padding: 0.5rem;
		font-size: 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		width: 200px; /* Adjust as needed */
		margin-bottom: 0.5rem;
	}

	/* Style for the date input */
	input[type='date'] {
		color: black;
		background-color: white;
		padding: 0.5rem;
		font-size: 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		width: 200px; /* Adjust as needed */
	}
	.genres-container {
		display: flex;
		flex-direction: column;
	}

	.genres-header {
		font-weight: bold;
		margin-bottom: 0.5em; /* Spacing above the genres */
		color: darkblue;
	}

	.genres-columns {
		display: grid;
		grid-template-columns: repeat(2, 1fr); /* Two columns */
		gap: 0.5em; /* Space between genres */
	}

	.genre-item {
		background-color: transparent; /* Example background for genre items */
		padding: 0.5em;
		border-radius: 4px;
		text-align: center; /* Center text within genre items */
	}

	.show-more-button {
		margin-top: 0.5em; /* Spacing above the button */
		padding: 0.5em 1em;
		background-color: #1db954; /* Spotify green */
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.show-more-button:hover {
		background-color: #1ed760; /* Slightly lighter on hover */
	}
	.show-more-results-button {
		margin: 2em auto;
		padding: 0.75em 1.5em;
		background-color: #1db954;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		transition: background-color 0.2s;
	}

	.show-more-results-button:hover {
		background-color: #1ed760;
	}

	/* Style the button as a box */
	button[type='submit'] {
		background-color: #1db954; /* Spotify green */
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		margin-left: 0.5rem; /* Space between input and button */
		margin-bottom: 0.5rem;
	}

	button[type='submit']:hover {
		background-color: #1ed760; /* Slightly lighter on hover */
	}
	.back-button {
		background-color: #1db954; /* Spotify green */
		color: white;
		border: 2px solid #1db954;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		margin-bottom: 0.5rem;
	}

	.back-button:hover {
		background-color: #1ed760;
		color: white;
	}
	.green-tick,
	.red-cross {
		font-size: 1.5rem;
		border: none;
		background: transparent;
		cursor: pointer;
		margin-right: 0.5rem;
	}

	.green-tick {
		color: green;
	}

	.red-cross {
		color: red;
	}

	/* Media query for smaller screens */
	@media screen and (max-width: 768px) {
		.poster-container {
			grid-template-columns: 1fr;
		}
		.header h1 {
			font-size: 3xl;
		}
		.header p {
			font-size: l;
		}
		.body {
			padding: 1rem;
		}
	}
</style>
