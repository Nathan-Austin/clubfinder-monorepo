<script lang="ts">
	import { onMount } from 'svelte';
	import { genresStore } from '../../../../stores/genresStore';

	let genresList: string[] = [];
	let selectedGenres: Set<string> = new Set();

	// Fetch the genres when the component mounts
	onMount(() => {
		const unsubscribe = genresStore.subscribe((genres) => {
			genresList = [...genres]; // Convert Set to Array
		});
		return unsubscribe;
	});

	function handleGenreClick(genre: string): void {
		if (selectedGenres.has(genre)) {
			selectedGenres.delete(genre);
		} else {
			selectedGenres.add(genre);
		}
	}

	function handleKeydown(event: KeyboardEvent, genre: string): void {
		if (event.key === 'Enter' || event.key === ' ') {
			handleGenreClick(genre);
		}
	}

	function handleSubmit(): void {
		console.log([...selectedGenres]);
		selectedGenres.clear();
	}

	function handleSubmitKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ' ') {
			handleSubmit();
		}
	}
</script>

<div>
	{#each genresList as genre (genre)}
		<button
			class:selected={selectedGenres.has(genre)}
			on:click={() => handleGenreClick(genre)}
			on:keydown={(event) => handleKeydown(event, genre)}
		>
			{genre}
		</button>
	{/each}
</div>

<button on:click={handleSubmit} on:keydown={handleSubmitKeydown}>Submit</button>

<style>
	.selected {
		background-color: #d3d3d3;
	}
</style>
