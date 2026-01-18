<script lang="ts">
	import type { EventDetails } from '$lib/types/events';

	type BarData = {
		bar_id: string;
		bar_name: string;
		bar_address: string;
		current_track_name: string | null;
		current_track_id: string | null;
		current_genres: string[];
		rolling_genre_profile: { [key: string]: number };
		description: string | null;
		opening_hours: string | null;
		phone: string | null;
		website: string | null;
	};

	type SimilarityResult = BarData & {
		similarity: number;
		matchingGenres: string[];
		events?: EventDetails[];
	};

	export let data: {
		city: string;
		date: string;
		address?: string;
		isLoggedIn: boolean;
		serverSimilarityResults: SimilarityResult[];
	};

	const city = data.city || 'Unknown City';
	const capitalizedCity = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
	const newdate = data.date;
	const address = data.address;
	const isLoggedIn = data.isLoggedIn;
	let showMoreMap: { [key: string]: boolean } = {}; // Track each bar's expanded state separately
	let interestedBars: { [key: string]: boolean } = {}; // Track interest state for each bar

	let options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
	let formattedDate = new Intl.DateTimeFormat('en-US', options).format(
		newdate ? new Date(newdate) : new Date()
	);
	let selectedDate = '';
	let similarityResults = data.serverSimilarityResults || [];

	let displayCount = 6; // Initial number of results to display
	const incrementAmount = 4; // Number of additional results to show when clicking "Show More"

	// Function to handle showing more results
	function handleShowMore() {
		displayCount += incrementAmount;
	}

	// Toggle expanded state for a specific bar
	function toggleShowMore(barId: string) {
		showMoreMap[barId] = !showMoreMap[barId];
	}

	// Calculate whether there are more results to show
	$: hasMoreResults = similarityResults.length > displayCount;

	// Get the currently visible results
	$: visibleResults = similarityResults.slice(0, displayCount);

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
		window.history.back();
	}

	async function markAsInterested(barId: string) {
		try {
			// Send the bar ID to your backend to mark it as "interested"
			const response = await fetch('/api/mark-bar-interested', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ barId })
			});

			if (response.ok) {
				interestedBars[barId] = true; // Mark as interested when the API call succeeds
				console.log('Marked bar as interested:', barId);
			} else {
				console.error('Failed to mark bar as interested');
			}
		} catch (error) {
			console.error('Error marking bar as interested:', error);
		}
	}

	function resetInterest(barId: string) {
		interestedBars[barId] = false; // Reset the interest state
	}

	// Calculate similarity percentage for display
	function getSimilarityPercentage(similarity: number): string {
		return Math.round(similarity * 100) + '%';
	}

	// Format date for display
	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const today = new Date();
		const tomorrow = new Date(today);
		tomorrow.setDate(today.getDate() + 1);

		// Check if it's today, tomorrow, or within the next 7 days
		if (date.toDateString() === today.toDateString()) {
			return 'Today';
		} else if (date.toDateString() === tomorrow.toDateString()) {
			return 'Tomorrow';
		} else if (date.getTime() < today.getTime() + 7 * 24 * 60 * 60 * 1000) {
			// Within the next 7 days, show day of week
			return date.toLocaleDateString('en-US', { weekday: 'long' });
		} else {
			// Format as month/day
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		}
	}

	// Format time for display
	function formatTime(timeString: string): string {
		if (!timeString) return '';

		const [hours, minutes] = timeString.split(':');
		const hour = parseInt(hours);

		// Convert to 12-hour format
		if (hour === 0) {
			return `12:${minutes} AM`;
		} else if (hour < 12) {
			return `${hour}:${minutes} AM`;
		} else if (hour === 12) {
			return `12:${minutes} PM`;
		} else {
			return `${hour - 12}:${minutes} PM`;
		}
	}

	// Function to combine and deduplicate genres from bar profile and events
	function getCombinedGenres(result: SimilarityResult): string[] {
		// Start with current genres from the bar's profile
		let allGenres = new Set(result.current_genres || []);

		// Add genres from rolling profile (these are keys of the object)
		if (result.rolling_genre_profile) {
			Object.keys(result.rolling_genre_profile).forEach((genre) => {
				allGenres.add(genre);
			});
		}

		// Add genres from events if available
		if (result.events && result.events.length > 0) {
			result.events.forEach((event) => {
				if (event.special_genres && Array.isArray(event.special_genres)) {
					event.special_genres.forEach((genre) => {
						allGenres.add(genre);
					});
				}
			});
		}

		return Array.from(allGenres);
	}

	// Function to get matching genres with highlighting
	function getHighlightedGenres(
		result: SimilarityResult
	): { genre: string; isMatching: boolean }[] {
		const allGenres = getCombinedGenres(result);
		const matchingGenresSet = new Set(result.matchingGenres || []);

		return allGenres
			.map((genre) => ({
				genre,
				isMatching: matchingGenresSet.has(genre)
			}))
			.sort((a, b) => {
				// Sort matching genres first
				if (a.isMatching && !b.isMatching) return -1;
				if (!a.isMatching && b.isMatching) return 1;
				// Then alphabetically
				return a.genre.localeCompare(b.genre);
			});
	}

	// Function to check if a bar has events today
	function hasEventsToday(result: SimilarityResult): boolean {
		if (!result.events || result.events.length === 0) return false;

		return result.events.some((event) => formatDate(event.event_date) === 'Today');
	}

	// Function to get event badge text
	function getEventBadgeText(result: SimilarityResult): string {
		if (!result.events || result.events.length === 0) return '';

		const todayEvents = result.events.filter((event) => formatDate(event.event_date) === 'Today');

		if (todayEvents.length > 0) {
			return `${todayEvents.length} Event${todayEvents.length > 1 ? 's' : ''} Today`;
		} else {
			// Sort events by date and return the earliest upcoming one
			const sortedEvents = [...result.events].sort(
				(a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
			);

			return `Next Event: ${formatDate(sortedEvents[0].event_date)}`;
		}
	}
</script>

<svelte:head>
	<title>Bars in {capitalizedCity} - Find Music Venues That Match Your Style | BarFindr</title>
	<meta
		name="description"
		content="Discover bars and music venues in {capitalizedCity} that match your music taste. Find current tracks, check out venues playing your favorite genres."
	/>
	<meta
		name="keywords"
		content="bars {capitalizedCity}, nightlife, music venues, current tracks, bar finder, {capitalizedCity} nightlife"
	/>

	<!-- Open Graph -->
	<meta
		property="og:title"
		content="Bars in {capitalizedCity} - Find Music Venues That Match Your Style | BarFindr"
	/>
	<meta
		property="og:description"
		content="Discover bars and music venues in {capitalizedCity} that match your music taste. Find current tracks and venues."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://barfindr.com/bars" />

	<!-- Twitter -->
	<meta name="twitter:title" content="Bars in {capitalizedCity} - BarFindr" />
	<meta
		name="twitter:description"
		content="Find bars and music venues in {capitalizedCity} that match your music taste."
	/>

	<!-- Additional SEO -->
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href="https://barfindr.com/bars" />
</svelte:head>

<div class="header mt-2 md:mt-16">
	<h1
		class="text-4xl md:text-8xl font-bold my-2 md:my-4 text-transparent bg-clip-text bg-gradient-to-br from-light via-light to-secondary"
	>
		BarFinder {capitalizedCity}
	</h1>
	<p class="text-l md:text-xl mb-4">Your style of music every time</p>
	<p class="text-l md:text-xl mb-4">Found bars matching your music style for {formattedDate}</p>

	<!-- Flex container to align the button and form horizontally -->
	<div class="flex flex-col md:flex-row items-center mt-6">
		<button type="button" class="back-button mr-4" on:click={goBack}>Change the vibe</button>
		<form method="GET" data-sveltekit-reload class="flex items-center">
			<div class="date-input-container">
				<input type="date" name="date" bind:value={selectedDate} required style="color: black;" />
			</div>
			<button type="submit" class="ml-2">Change Date</button>
		</form>
	</div>
</div>

<div class="body">
	{#if similarityResults.length === 0}
		<div class="no-results">
			<p>
				Sorry, we couldn't find any bars matching your music preferences. Try something else by
				clicking "Change The Vibe" or selecting different genres.
			</p>
		</div>
	{:else}
		<div class="poster-container">
			{#each visibleResults as result}
				<div class="poster">
					{#if result.similarity > 0}
						<div class="similarity-badge">
							{getSimilarityPercentage(result.similarity)} Match
						</div>
					{/if}

					{#if result.events && result.events.length > 0}
						<div class="event-badge">
							{getEventBadgeText(result)}
						</div>
					{/if}

					<div class="flyer-container">
						<!-- Placeholder for bar image if available -->
						<img src="/images/static_bar.jpg" alt="Bar placeholder" />
					</div>
					<div class="info-container">
						<div class="item">
							<div class="label">Bar:</div>
							<div class="value club-value">
								<span>{result.bar_name}</span>
								<a
									href={generateGoogleMapsLink(result.bar_address, address)}
									target="_blank"
									class="location-icon"
									rel="noopener noreferrer"
									on:click={() => markAsInterested(result.bar_id)}
								>
									<img src="/images/pin-location-icon.jpg" alt="Location Marker" />
								</a>
							</div>
						</div>

						<div class="item">
							<div class="label">Current Track:</div>
							<div class="value">
								{#if result.current_track_name}
									{result.current_track_name}
								{:else}
									No track currently playing
								{/if}
							</div>
						</div>

						<!-- Events Section -->
						{#if result.events && result.events.length > 0}
							<div class="item events-container">
								<div class="label">Events:</div>
								<div class="events-list">
									{#each result.events.slice(0, 3) as event}
										<div class="event-item">
											<div class="event-header">
												<span class="event-name">{event.theme_name}</span>
												<span class="event-date">{formatDate(event.event_date)}</span>
											</div>
											{#if event.start_time}
												<div class="event-time">
													<span class="time-icon">🕒</span>
													Starts at {formatTime(event.start_time)}
												</div>
											{/if}
											{#if event.description}
												<div class="event-description">{event.description}</div>
											{/if}
											{#if event.special_genres && event.special_genres.length > 0}
												<div class="event-genres">
													{#each event.special_genres.slice(0, 3) as genre}
														<span class="genre-bubble">{genre}</span>
													{/each}
													{#if event.special_genres.length > 3}
														<span class="more-genres">+{event.special_genres.length - 3} more</span>
													{/if}
												</div>
											{/if}
										</div>
									{/each}
									{#if result.events.length > 3}
										<div class="more-events">+{result.events.length - 3} more events</div>
									{/if}
								</div>
							</div>
						{/if}

						{#if isLoggedIn}
							<div class="item">
								<div class="label">Interested ?:</div>
								<div class="value">
									{#if interestedBars[result.bar_id]}
										<span class="interest-icon green-tick">✓</span>
										<button class="red-cross" on:click={() => resetInterest(result.bar_id)}
											>✕</button
										>
									{:else}
										<button class="green-tick" on:click={() => markAsInterested(result.bar_id)}
											>✓</button
										>
										<button class="red-cross" on:click={() => resetInterest(result.bar_id)}
											>✕</button
										>
									{/if}
								</div>
							</div>
						{/if}

						<!-- Combined Genres Section -->
						<div class="item">
							<div class="value genres-container">
								<div class="genres-header">Genres:</div>
								<div class="genres-columns">
									{#each getHighlightedGenres(result).slice(0, showMoreMap[result.bar_id] ? getHighlightedGenres(result).length : 5) as genreData}
										<div class="genre-item {genreData.isMatching ? 'matching' : ''}">
											{genreData.genre}
											{#if genreData.isMatching}
												<span class="match-indicator">✓</span>
											{/if}
										</div>
									{/each}
								</div>
								{#if getHighlightedGenres(result).length > 5}
									<button on:click={() => toggleShowMore(result.bar_id)} class="show-more-button">
										{showMoreMap[result.bar_id] ? 'Show Less' : 'Show More'}
									</button>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>

		{#if hasMoreResults}
			<button on:click={handleShowMore} class="show-more-results-button"> Show More Bars </button>
		{/if}

		<p class="mt-4 update-message">
			Music data is updated in real-time from what's currently playing
		</p>
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
		min-height: 80vh;
	}

	.poster-container {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
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
		border-radius: 8px;
		box-shadow: 0 10px 15px rgba(0, 0, 0, 0.3);
		border: 2px solid rgb(192, 209, 224);
		position: relative;
		overflow: hidden;
	}

	.similarity-badge {
		position: absolute;
		top: 0;
		right: 0;
		background-color: #1db954;
		color: white;
		padding: 0.4em 0.8em;
		border-bottom-left-radius: 8px;
		font-weight: bold;
		font-size: 0.9rem;
	}

	.flyer-container {
		position: relative;
		width: 100%;
		overflow: hidden;
		border-radius: 4px;
	}

	.flyer-container::before {
		content: '';
		display: block;
		padding-top: 60%; /* 3:5 Aspect Ratio */
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
		gap: 0.8em;
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
		color: #333;
		min-width: 80px;
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
		font-weight: bold;
		font-size: 1.1rem;
	}

	.location-icon img {
		width: 25px;
		height: 25px;
		margin-left: 10px;
	}

	.date-input-container input[type='date'] {
		padding: 0.5rem;
		font-size: 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		width: 200px;
		margin-bottom: 0.5rem;
	}

	input[type='date'] {
		color: black;
		background-color: white;
		padding: 0.5rem;
		font-size: 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		width: 200px;
	}

	.genres-container {
		display: flex;
		flex-direction: column;
	}

	.genres-header {
		font-weight: bold;
		margin-bottom: 0.5em;
		color: #333;
	}

	.genres-columns {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
	}

	.genre-item {
		background-color: #e0e0e0;
		padding: 0.4em 0.8em;
		border-radius: 16px;
		font-size: 0.8rem;
		color: #333;
		display: flex;
		align-items: center;
	}

	.genre-item.matching {
		background-color: #1db954;
		color: white;
	}

	.match-indicator {
		margin-left: 4px;
		font-size: 0.7rem;
	}

	.show-more-button {
		margin-top: 0.8em;
		padding: 0.4em 0.8em;
		background-color: transparent;
		color: #1db954;
		border: 1px solid #1db954;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
		align-self: flex-start;
	}

	.show-more-button:hover {
		background-color: rgba(29, 185, 84, 0.1);
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
		background-color: #18a64b;
	}

	.update-message {
		color: #555;
		font-size: 0.9rem;
		font-style: italic;
		text-align: center;
	}

	button[type='submit'] {
		background-color: #1db954;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		margin-left: 0.5rem;
		margin-bottom: 0.5rem;
	}

	button[type='submit']:hover {
		background-color: #18a64b;
	}

	.back-button {
		background-color: #1db954;
		color: white;
		border: 2px solid #1db954;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		margin-bottom: 0.5rem;
	}

	.back-button:hover {
		background-color: #18a64b;
		border-color: #18a64b;
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
		font-size: 1rem;
		margin-left: 8px;
	}

	/* Event styles */
	.event-badge {
		position: absolute;
		top: 3rem;
		right: 1rem;
		background-color: #1db954;
		color: white;
		padding: 0.4em 0.8em;
		border-radius: 20px;
		font-weight: bold;
		font-size: 0.9rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		z-index: 2;
	}

	.events-container {
		margin-top: 1rem;
	}

	.events-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.event-item {
		background-color: rgba(255, 255, 255, 0.4);
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 0.75rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		border: 1px solid rgba(29, 185, 84, 0.2);
	}

	.event-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.25rem;
	}

	.event-name {
		font-weight: 600;
		color: #1c1c1c;
	}

	.event-description {
		font-size: 0.9rem;
		color: #444;
		margin: 0.5rem 0;
		line-height: 1.4;
	}

	.event-date {
		background-color: #1db954;
		color: white;
		font-size: 0.8rem;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-weight: 500;
	}

	.event-time {
		font-size: 0.85rem;
		color: #444;
		margin-bottom: 0.25rem;
	}

	.event-genres {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.5rem;
	}

	.genre-bubble {
		background-color: rgba(29, 185, 84, 0.15);
		color: #1a7940;
		font-size: 0.75rem;
		padding: 0.15rem 0.4rem;
		border-radius: 12px;
	}

	.more-genres {
		font-size: 0.75rem;
		color: #666;
	}

	.more-events {
		text-align: center;
		font-size: 0.85rem;
		color: #1db954;
		padding: 0.5rem;
		cursor: pointer;
	}

	.more-events:hover {
		text-decoration: underline;
	}

	.time-icon {
		margin-right: 0.3rem;
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
		.label {
			min-width: 70px;
		}

		.event-badge {
			top: 0.5rem;
			right: 0.5rem;
			font-size: 0.8rem;
		}

		.similarity-badge {
			top: 0.5rem;
			left: 0.5rem;
			right: auto;
			border-radius: 0 0 8px 0;
			font-size: 0.8rem;
		}
	}
</style>
