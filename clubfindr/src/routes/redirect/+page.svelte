<script lang="ts">
	// Every QR code in a venue's list is https://clubfindr.com/redirect?barId=…&qrId=… (KNOWN_ISSUES
	// 84), so a phone's own camera lands here. With the app installed the deep link opens it; without
	// it, the store. Until 2026-11-19 the store links were placeholders that disagreed with each
	// other (KNOWN_ISSUES 88), and the fallback fired even when the app had opened.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { APP_SCHEME, APP_STORE_URL, PLAY_STORE_URL } from '$lib/storeLinks';

	let platform = $state<'android' | 'ios' | 'other'>('other');

	onMount(() => {
		const ua = navigator.userAgent;
		platform = /Android/i.test(ua) ? 'android' : /iPad|iPhone|iPod/.test(ua) ? 'ios' : 'other';

		const params = page.url.searchParams;
		const deepLink = `${APP_SCHEME}://checkin?barId=${encodeURIComponent(
			params.get('barId') ?? ''
		)}&qrId=${encodeURIComponent(params.get('qrId') ?? '')}&type=${encodeURIComponent(
			params.get('type') ?? ''
		)}&barName=${encodeURIComponent(params.get('barName') ?? '')}`;

		// If the app opens, this page goes to the background: then there is nothing to fall back
		// to. The old check (`Date.now() - now < 3000` after 2000 ms) was always true.
		let opened = false;
		const markOpened = () => {
			if (document.visibilityState === 'hidden') opened = true;
		};
		document.addEventListener('visibilitychange', markOpened);
		window.addEventListener('pagehide', markOpened);
		window.addEventListener('blur', markOpened);

		window.location.href = deepLink;

		// Only a phone whose store we can name is sent on by itself; everyone else keeps the badges
		const storeUrl =
			platform === 'android' ? PLAY_STORE_URL : platform === 'ios' ? APP_STORE_URL : null;
		const timer = setTimeout(() => {
			if (!opened && document.visibilityState === 'visible' && storeUrl) {
				window.location.href = storeUrl;
			}
		}, 2000);

		return () => {
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', markOpened);
			window.removeEventListener('pagehide', markOpened);
			window.removeEventListener('blur', markOpened);
		};
	});
</script>

<svelte:head>
	<title>Opening Tilki</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container">
	<img src="/logo.png" alt="Clubfindr Logo" class="logo" />
	<h1>Opening Tilki…</h1>
	<div class="loading"></div>
	<p>If nothing happens, the app is not installed yet.</p>
	<div class="store-buttons">
		<a href={PLAY_STORE_URL} data-testid="play-store-link">
			<img src="/play-store-badge.png" alt="Get it on Google Play" height="40" />
		</a>
		{#if APP_STORE_URL}
			<a href={APP_STORE_URL} data-testid="app-store-link">
				<img src="/app-store-badge.png" alt="Download on the App Store" height="40" />
			</a>
		{/if}
	</div>
	{#if !APP_STORE_URL && platform === 'ios'}
		<p class="note" data-testid="ios-note">
			Tilki for iPhone is on its way to the App Store. Until then it is on Android.
		</p>
	{/if}
</div>

<style>
	.container {
		font-family: Arial, sans-serif;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		margin: 0;
		padding: 20px;
		text-align: center;
		background-color: #f5f5f5;
		color: #1a1a1a;
	}
	.logo {
		width: 100px;
		height: 100px;
		margin-bottom: 20px;
	}
	.loading {
		width: 40px;
		height: 40px;
		border: 5px solid #f3f3f3;
		border-top: 5px solid #3498db;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 20px 0;
	}
	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}
	.store-buttons {
		display: flex;
		gap: 10px;
	}
	.note {
		margin-top: 1rem;
		color: #555;
	}
</style>
