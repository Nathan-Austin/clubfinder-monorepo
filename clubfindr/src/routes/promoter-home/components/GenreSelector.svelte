<script lang="ts">
	import { onMount } from 'svelte';
	import { ChevronDown, X, ChevronRight } from 'lucide-svelte';

	export let selectedGenres: string[] = [];
	let genreData: GenreData = {};
	let isOpen = false;
	let searchTerm = '';
	let expandedMainGenres: Set<string> = new Set();
	let expandedSubGenres: Set<string> = new Set();

	// Flatten genres for search functionality
	let flatGenreList: string[] = [];

	interface SubSubGenre {
		name: string;
	}

	interface SubGenre {
		name: string;
		subsubgenres?: (string | SubSubGenre)[];
	}

	interface GenreData {
		[mainGenre: string]: {
			subgenres: (string | SubGenre)[];
		};
	}

	onMount(async () => {
		try {
			const response = await fetch('/lib/genres.json');
			genreData = await response.json();

			// Create flattened list of all genres for search
			flatGenreList = Object.entries(genreData).reduce(
				(acc: string[], [mainGenre, data]: [string, GenreData[string]]) => {
					// Add main genre
					acc.push(mainGenre);

					// Add subgenres
					data.subgenres.forEach((subgenre: string | SubGenre) => {
						if (typeof subgenre === 'string') {
							acc.push(subgenre);
						} else if (subgenre.name) {
							acc.push(subgenre.name);
							// Add sub-subgenres if they exist
							if (subgenre.subsubgenres) {
								if (Array.isArray(subgenre.subsubgenres)) {
									subgenre.subsubgenres.forEach((subsubgenre: string | SubSubGenre) => {
										if (typeof subsubgenre === 'string') {
											acc.push(subsubgenre);
										} else if (subsubgenre.name) {
											acc.push(subsubgenre.name);
										}
									});
								}
							}
						}
					});
					return acc;
				},
				[]
			);
		} catch (error) {
			console.error('Failed to load genres:', error);
			genreData = {};
		}
	});

	function toggleGenre(genre: string) {
		if (selectedGenres.includes(genre)) {
			selectedGenres = selectedGenres.filter((g) => g !== genre);
		} else {
			selectedGenres = [...selectedGenres, genre];
		}
	}

	function removeGenre(genre: string) {
		selectedGenres = selectedGenres.filter((g) => g !== genre);
	}

	function toggleMainGenre(mainGenre: string, hasSubgenres: boolean) {
		if (!hasSubgenres) {
			toggleGenre(mainGenre);
		} else {
			if (expandedMainGenres.has(mainGenre)) {
				expandedMainGenres.delete(mainGenre);
			} else {
				expandedMainGenres.add(mainGenre);
			}
			expandedMainGenres = expandedMainGenres;
		}
	}

	function toggleSubGenre(subgenre: SubGenre | string) {
		const genreName = typeof subgenre === 'string' ? subgenre : subgenre.name;
		const hasSubSubgenres = typeof subgenre === 'object' && subgenre.subsubgenres?.length > 0;

		if (!hasSubSubgenres) {
			toggleGenre(genreName);
		} else {
			if (expandedSubGenres.has(genreName)) {
				expandedSubGenres.delete(genreName);
			} else {
				expandedSubGenres.add(genreName);
			}
			expandedSubGenres = expandedSubGenres;
		}
	}

	$: filteredGenres = searchTerm
		? flatGenreList.filter(
				(genre) =>
					genre.toLowerCase().includes(searchTerm.toLowerCase()) && !selectedGenres.includes(genre)
		  )
		: [];
</script>

<div class="relative">
	<div class="w-full">
		<!-- Selected genres tags -->
		<div class="min-h-[42px] w-full border rounded-md p-2 flex flex-wrap gap-2 bg-white">
			{#each selectedGenres as genre}
				<span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-md flex items-center gap-1">
					{genre}
					<button type="button" class="hover:text-blue-600" on:click={() => removeGenre(genre)}>
						<X size={16} />
					</button>
				</span>
			{/each}
			<button
				type="button"
				class="flex items-center gap-1 text-gray-600 hover:text-gray-800"
				on:click={() => (isOpen = !isOpen)}
			>
				{isOpen ? 'Close menu' : 'Select genres'}
				<span class:rotate-180={isOpen} class="transition-transform duration-200">
					<ChevronDown size={20} />
				</span>
			</button>
		</div>

		<!-- Dropdown menu -->
		{#if isOpen}
			<div class="mt-1 w-full bg-white border rounded-md shadow-lg">
				<div class="p-2">
					<input
						type="text"
						bind:value={searchTerm}
						placeholder="Search genres..."
						class="w-full p-2 border rounded-md"
					/>
				</div>

				<!-- Search results -->
				{#if searchTerm}
					<div class="max-h-60 overflow-y-auto">
						{#each filteredGenres as genre}
							<button
								type="button"
								class="w-full text-left px-4 py-2 hover:bg-gray-100"
								on:click={() => {
									toggleGenre(genre);
									searchTerm = '';
								}}
							>
								{genre}
							</button>
						{/each}
					</div>
				{:else}
					<!-- Hierarchical genre list -->
					<div class="max-h-60 overflow-y-auto">
						{#each Object.entries(genreData) as [mainGenre, data]}
							<div class="border-b">
								<button
									type="button"
									class="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center justify-between font-semibold"
									on:click={() => toggleMainGenre(mainGenre, data.subgenres.length > 0)}
								>
									<span>{mainGenre}</span>
									{#if data.subgenres.length > 0}
										<div
											class="transform transition-transform duration-200"
											class:rotate-90={expandedMainGenres.has(mainGenre)}
										>
											<ChevronRight size={20} />
										</div>
									{/if}
								</button>

								{#if expandedMainGenres.has(mainGenre) && data.subgenres}
									<div class="pl-4">
										{#each data.subgenres as subgenre}
											{#if typeof subgenre === 'string'}
												<button
													type="button"
													class="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center justify-between font-semibold"
													on:click={() => toggleGenre(subgenre)}
												>
													<span>{subgenre}</span>
												</button>
											{:else}
												<div>
													<button
														type="button"
														class="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center justify-between font-semibold"
														on:click={() => toggleSubGenre(subgenre)}
													>
														<span>{subgenre.name}</span>
														{#if subgenre.subsubgenres?.length > 0}
															<div
																class="transform transition-transform duration-200"
																class:rotate-90={expandedSubGenres.has(subgenre.name)}
															>
																<ChevronRight size={16} />
															</div>
														{/if}
													</button>

													{#if expandedSubGenres.has(subgenre.name) && subgenre.subsubgenres}
														<div class="pl-4">
															{#each subgenre.subsubgenres as subsubgenre}
																<button
																	type="button"
																	class="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center justify-between font-semibold"
																	on:click={() =>
																		toggleGenre(
																			typeof subsubgenre === 'string'
																				? subsubgenre
																				: subsubgenre.name
																		)}
																>
																	<span>
																		{typeof subsubgenre === 'string'
																			? subsubgenre
																			: subsubgenre.name}
																	</span>
																</button>
															{/each}
														</div>
													{/if}
												</div>
											{/if}
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
