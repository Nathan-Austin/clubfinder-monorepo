<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	let status: 'loading' | 'success' | 'error' = $state('loading');
	let message = $state('Confirming your registration...');
	let barName = $state('');

	onMount(async () => {
		const email = page.url.searchParams.get('email');
		const code = page.url.searchParams.get('code');

		if (!email || !code) {
			status = 'error';
			message = 'Invalid confirmation link. Missing email or code.';
			return;
		}

		try {
			const response = await fetch('/api/mobile/bars/confirm', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email,
					confirmationCode: code
				})
			});

			const data = await response.json();

			if (data.success) {
				status = 'success';
				barName = data.barData?.name || '';
				message = 'Your account has been confirmed!';
			} else {
				status = 'error';
				message = data.error || 'Failed to confirm registration.';
			}
		} catch (err) {
			status = 'error';
			message = 'An error occurred. Please try again later.';
			console.error('Confirmation error:', err);
		}
	});
</script>

<svelte:head>
	<title>Confirm Registration - ClubFindr</title>
</svelte:head>

<div
	class="min-h-screen bg-linear-to-b from-gray-900 to-black flex items-center justify-center px-4"
>
	<div class="max-w-md w-full bg-gray-800 rounded-xl shadow-2xl p-8 text-center">
		{#if status === 'loading'}
			<div
				class="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500 mx-auto mb-6"
			></div>
			<p class="text-gray-300 text-lg">{message}</p>
		{:else if status === 'success'}
			<div class="mb-6">
				<svg
					class="h-20 w-20 text-green-500 mx-auto"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</div>
			<h1 class="text-2xl font-bold text-white mb-2">Welcome to ClubFindr!</h1>
			{#if barName}
				<p class="text-purple-400 text-lg mb-4">{barName}</p>
			{/if}
			<p class="text-gray-300 mb-6">{message}</p>
			<div class="bg-gray-700 rounded-lg p-4 mb-6">
				<p class="text-gray-200">
					You can now log in using the <span class="text-purple-400 font-semibold">Tilki app</span>
				</p>
			</div>
			<p class="text-gray-500 text-sm">
				A welcome email has been sent to your registered email address.
			</p>
		{:else}
			<div class="mb-6">
				<svg
					class="h-20 w-20 text-red-500 mx-auto"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</div>
			<h1 class="text-2xl font-bold text-white mb-4">Confirmation Failed</h1>
			<p class="text-gray-300 mb-6">{message}</p>
			<div class="bg-gray-700 rounded-lg p-4">
				<p class="text-gray-200 text-sm">
					If your code has expired, open the Tilki app and request a new confirmation code.
				</p>
			</div>
		{/if}
	</div>
</div>
