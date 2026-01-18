<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	onMount(() => {
		// Parse URL parameters
		const barId = $page.url.searchParams.get('barId');
		const qrId = $page.url.searchParams.get('qrId');
		const type = $page.url.searchParams.get('type');
		const barName = $page.url.searchParams.get('barName') || '';

		// Create the deep link URL
		const deepLink = `clubfindr://checkin?barId=${barId}&qrId=${qrId}&type=${type}&barName=${encodeURIComponent(
			barName
		)}`;

		// Store the time when we start trying to open the app
		const now = Date.now();

		// Try to open the app
		window.location.href = deepLink;

		// If we're still here after 2 seconds, redirect to the app store
		setTimeout(function () {
			// If the page is still visible after 2 seconds, the app probably isn't installed
			if (Date.now() - now < 3000) {
				// Check if iOS or Android
				const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

				if (isIOS) {
					window.location.href = 'https://apps.apple.com/app/clubfindr/idXXXXXXXXXX'; // Replace with your App Store URL
				} else {
					window.location.href = 'https://play.google.com/store/apps/details?id=com.clubfindr.app'; // Replace with your Play Store URL
				}
			}
		}, 2000);
	});
</script>

<svelte:head>
	<title>Redirecting to Tilki</title>
</svelte:head>

<div class="container">
	<img src="/logo.png" alt="Clubfindr Logo" class="logo" />
	<h1>Opening Clubfindr...</h1>
	<div class="loading" />
	<p>If nothing happens, please download the app:</p>
	<div class="store-buttons">
		<a href="https://apps.apple.com/app/tilki/idXXXXXXXXXX">
			<img src="/app-store-badge.png" alt="App Store" height="40" />
		</a>
		<a href="https://play.google.com/store/apps/details?id=com.tikli.app">
			<img src="/play-store-badge.png" alt="Play Store" height="40" />
		</a>
	</div>
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
</style>
