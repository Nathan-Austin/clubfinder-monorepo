<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';

	export let data: PageData;
	let { genresList } = data;
	let selectedGenres = new Set<string>();
	let customGenre = '';
	let customGenres = new Set<string>();
	let errorMessage = '';

	function toggleGenre(genre: string) {
		if (selectedGenres.has(genre)) {
			selectedGenres.delete(genre);
		} else {
			selectedGenres.add(genre);
		}
		selectedGenres = selectedGenres; // Force Svelte reactivity
	}

	function addCustomGenre() {
		const trimmedGenre = customGenre.trim().toLowerCase();
		if (!trimmedGenre) {
			errorMessage = 'Please enter a genre';
			return;
		}
		if (customGenres.has(trimmedGenre) || genresList.includes(trimmedGenre)) {
			errorMessage = 'This genre already exists';
			return;
		}

		customGenres.add(trimmedGenre);
		customGenres = customGenres; // Force Svelte reactivity
		customGenre = ''; // Clear input
		errorMessage = '';
	}

	function removeCustomGenre(genre: string) {
		customGenres.delete(genre);
		selectedGenres.delete(genre);
		customGenres = customGenres; // Force Svelte reactivity
		selectedGenres = selectedGenres;
	}

	async function handleSubmit() {
		const allSelectedGenres = Array.from(selectedGenres);

		// Store selected genres in a cookie
		document.cookie = `selected-genres=${allSelectedGenres.join(',')}; path=/; max-age=${
			60 * 60 * 24
		}`;

		// Redirect to clubs page
		goto('/clubs');
	}
	async function handleSubmitBars() {
		const allSelectedGenres = Array.from(selectedGenres);

		// Store selected genres in a cookie
		document.cookie = `selected-genres=${allSelectedGenres.join(',')}; path=/; max-age=${
			60 * 60 * 24
		}`;

		// Redirect to clubs page
		goto('/barfindr');
	}

	function goBack() {
		goto('/spotify');
	}
</script>

<div class="container">
	<!-- Back Button -->
	<button class="back-button" on:click={goBack}>
		<span class="back-arrow">←</span> Back to Spotify
	</button>

	<h1 class="title">Select Your Preferred Genres</h1>

	<!-- Custom Genre Input -->
	<div class="custom-genre-section">
		<h2 class="subtitle">Add Custom Genre</h2>
		<div class="input-group">
			<input
				type="text"
				bind:value={customGenre}
				placeholder="Enter a custom genre"
				class="custom-genre-input"
				on:keydown={(e) => e.key === 'Enter' && addCustomGenre()}
			/>
			<button class="add-button" on:click={addCustomGenre}>Add</button>
		</div>
		{#if errorMessage}
			<p class="error-message">{errorMessage}</p>
		{/if}

		<!-- Custom Genres List -->
		{#if customGenres.size > 0}
			<div class="custom-genres-list">
				{#each Array.from(customGenres) as genre}
					<div class="genre-tag">
						<label class="genre-label">
							<input
								type="checkbox"
								checked={selectedGenres.has(genre)}
								on:change={() => toggleGenre(genre)}
							/>
							{genre}
						</label>
						<button class="remove-button" on:click={() => removeCustomGenre(genre)}>×</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Spotify Genres Grid -->
	<div class="genres-section">
		<h2 class="subtitle">Spotify Genres</h2>
		<div class="genres-grid">
			{#each genresList as genre}
				<div class="genre-item">
					<label class="genre-label">
						<input
							type="checkbox"
							checked={selectedGenres.has(genre)}
							on:change={() => toggleGenre(genre)}
						/>
						{genre}
					</label>
				</div>
			{/each}
		</div>
	</div>

	<!-- Submit Button -->
	<div class="submit-section">
		<button class="submit-button" on:click={handleSubmit} disabled={selectedGenres.size === 0}>
			Find Clubs
		</button>
		<span class="separator">or</span>
		<button class="submit-button-bars" on:click={handleSubmitBars} disabled={selectedGenres.size === 0}>
			Find Bars
		</button>
	</div>
</div>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.back-button {
		display: flex;
		align-items: center;
		padding: 0.5rem 1rem;
		margin-bottom: 1rem;
		background: none;
		border: none;
		color: #1db954;
		font-size: 1rem;
		cursor: pointer;
		transition: color 0.2s;
	}

	.back-button:hover {
		color: #1ed760;
	}

	.back-arrow {
		margin-right: 0.5rem;
		font-size: 1.2rem;
	}

	.title {
		font-size: 2rem;
		font-weight: bold;
		margin-bottom: 2rem;
		text-align: center;
		color: #1db954; /* Spotify green */
	}

	.subtitle {
		font-size: 1.5rem;
		margin-bottom: 1rem;
		color: #333;
	}

	.custom-genre-section {
		margin-bottom: 2rem;
		padding: 1rem;
		background-color: #f5f5f5;
		border-radius: 8px;
	}

	.input-group {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.custom-genre-input {
		flex: 1;
		padding: 0.5rem;
		border: 2px solid #ddd;
		border-radius: 4px;
		font-size: 1rem;
	}

	.add-button {
		padding: 0.5rem 1rem;
		background-color: #1db954;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.add-button:hover {
		background-color: #1ed760;
	}

	.error-message {
		color: #ff4444;
		margin-top: 0.5rem;
	}

	.custom-genres-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.genre-tag {
		display: flex;
		align-items: center;
		background-color: #fff;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		border: 1px solid #ddd;
	}

	.remove-button {
		margin-left: 0.5rem;
		background: none;
		border: none;
		color: #ff4444;
		cursor: pointer;
		font-size: 1.2rem;
		padding: 0 0.25rem;
	}

	.genres-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}

	.genre-item {
		background-color: #f5f5f5;
		padding: 0.5rem;
		border-radius: 4px;
		transition: background-color 0.2s;
	}

	.genre-item:hover {
		background-color: #e5e5e5;
	}

	.genre-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.genre-label input[type='checkbox'] {
		width: 1.2rem;
		height: 1.2rem;
	}

	.submit-section {
		margin-top: 2rem;
		text-align: center;
	}

	.submit-button {
		padding: 1rem 2rem;
		background-color: #333;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 1.2rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}
	.submit-button-bars {
		padding: 1rem 2rem;
		background-color: #1db954;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 1.2rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}
	.submit-button:hover {
		background-color: #1ed760;
	}

	.submit-button:disabled {
		background-color: #ccc;
		cursor: not-allowed;
	}
	.submit-button-bars:disabled {
		background-color: #ccc;
		cursor: not-allowed;
	}
</style>
