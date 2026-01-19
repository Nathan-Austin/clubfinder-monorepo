<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
	let { genresList } = data;
</script>

<h1 class="text-2xl">Genres List</h1>

<ul>
	{#each [...genresList] as genre}
		<li>{genre}</li>
	{/each}
</ul>
