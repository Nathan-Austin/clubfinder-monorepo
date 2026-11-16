<script lang="ts">
	// Which city's venues and events the user sees (KNOWN_ISSUES 67). Saves through
	// PUT /api/account/city, which also moves the session and the `city` cookie, so /clubs and
	// /barfindr use the new city straight away.
	let { city, cities }: { city: string | null; cities: { name: string; slug: string }[] } =
		$props();

	// The saved value starts from the server's; the select is the user's choice
	// svelte-ignore state_referenced_locally
	let selected = $state(city ?? '');
	// svelte-ignore state_referenced_locally
	let saved = $state(city);
	let status = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let message = $state('');

	async function save() {
		status = 'saving';
		try {
			const response = await fetch('/api/account/city', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ city: selected })
			});
			const result = await response.json();
			if (!response.ok || !result.success) throw new Error(result.message || 'Could not save');
			saved = result.city;
			status = 'saved';
			message = `Your city is now ${cities.find((c) => c.slug === saved)?.name ?? saved}.`;
		} catch (error) {
			status = 'error';
			message = error instanceof Error ? error.message : 'Could not save your city';
		}
	}
</script>

<!-- Not a <form>: the page's own form, the one with the password, has the submit button -->
<section class="max-w-md mx-auto mb-10" data-testid="city-picker">
	<label for="city" class="block mb-2 text-white">Your city</label>
	<div class="flex gap-2">
		<select
			id="city"
			bind:value={selected}
			class="flex-1 p-2 rounded-sm bg-gray-700 border border-gray-600 text-white"
		>
			{#if !saved}
				<option value="" disabled>Choose your city</option>
			{/if}
			{#each cities as option (option.slug)}
				<option value={option.slug}>{option.name}</option>
			{/each}
		</select>
		<button
			type="button"
			onclick={save}
			disabled={!selected || selected === saved || status === 'saving'}
			class="px-4 py-2 bg-blue-500 text-white rounded-sm hover:bg-blue-600 transition-colors disabled:opacity-50"
		>
			{status === 'saving' ? 'Saving…' : 'Save city'}
		</button>
	</div>
	{#if status === 'saved' || status === 'error'}
		<p
			class="mt-2 p-2 rounded-sm text-white {status === 'saved' ? 'bg-green-600' : 'bg-red-500'}"
			role="status"
		>
			{message}
		</p>
	{/if}
</section>
