<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { genres } from '../../../../stores/genres.svelte';

	const selectedGenres = new SvelteSet<string>();

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
	{#each [...genres] as genre (genre)}
		<button
			class:selected={selectedGenres.has(genre)}
			onclick={() => handleGenreClick(genre)}
			onkeydown={(event) => handleKeydown(event, genre)}
		>
			{genre}
		</button>
	{/each}
</div>

<button onclick={handleSubmit} onkeydown={handleSubmitKeydown}>Submit</button>

<style>
	.selected {
		background-color: #d3d3d3;
	}
</style>
