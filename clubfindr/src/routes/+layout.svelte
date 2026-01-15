<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import { goto } from '$app/navigation';

	import { page } from '$app/stores';
	let isLoggedIn = false;
	let isPartnerLoggedIn = false;
	let isMenuOpen = false;
	let currentSubmenu: string | null = null;
	let isMobile = false;
	let consentGiven = false;
	let cookiePreferences = {
		necessary: true,
		analytics: false,
		marketing: false,
		performance: false
	};
	type CookiePreferences = typeof cookiePreferences;
	let showModal = false;
	$: isLoggedIn = $page.data.isLoggedIn;
	$: isPartnerLoggedIn = $page.data.isPartnerLoggedIn;
	export function loadPreferences() {
		const storedPreferences = localStorage.getItem('cookiePreferences');
		if (storedPreferences) {
			cookiePreferences = JSON.parse(storedPreferences);
			consentGiven = true;
			updateConsent(cookiePreferences);
		}
	}

	export function acceptConsent() {
		consentGiven = true;
		cookiePreferences = {
			necessary: true,
			analytics: true,
			marketing: true,
			performance: true
		};
		localStorage.setItem('cookiePreferences', JSON.stringify(cookiePreferences));
		updateConsent(cookiePreferences);
	}

	export function declineConsent() {
		consentGiven = false;
		cookiePreferences = {
			necessary: true,
			analytics: false,
			marketing: false,
			performance: false
		};
		localStorage.setItem('cookiePreferences', JSON.stringify(cookiePreferences));
		updateConsent(cookiePreferences);
	}

	export function updateConsent(preferences: CookiePreferences) {
		if (typeof window.gtag === 'function') {
			console.log('Updating consent with preferences:', preferences);
			window.gtag('consent', 'update', {
				ad_storage: preferences.marketing ? 'granted' : 'denied',
				analytics_storage: preferences.analytics ? 'granted' : 'denied'
			});
		} else {
			console.warn('gtag not available when trying to update consent');
		}
	}

	export function openCustomModal() {
		showModal = true;
	}

	export function savePreferences() {
		localStorage.setItem('cookiePreferences', JSON.stringify(cookiePreferences));
		consentGiven = true;
		showModal = false;
		updateConsent(cookiePreferences);
	}

	function initGoogleAnalytics() {
		// Set up dataLayer and gtag function
		window.dataLayer = window.dataLayer || [];
		window.gtag = function (command, ...args) {
			window.dataLayer.push({ event: command, ...Object(args[0] || {}) });
		};

		// Initialize with default denied consent
		window.gtag('consent', 'default', {
			ad_storage: 'denied',
			analytics_storage: 'denied'
		});

		// Initialize GA with your measurement ID
		window.gtag('js', new Date());
		window.gtag('config', 'G-YLD4MWTMRW', { anonymize_ip: true });

		// Then load the script
		const script = document.createElement('script');
		script.async = true;
		script.src = 'https://www.googletagmanager.com/gtag/js?id=G-YLD4MWTMRW';
		document.head.appendChild(script);

		// Add error handling
		script.onerror = () => console.error('Failed to load Google Analytics');
	}

	onMount(() => {
		checkMobile();
		window.addEventListener('resize', checkMobile);
		loadPreferences();

		// Always initialize GA, but with default denied consent
		initGoogleAnalytics();

		// If consent was previously given, update the consent state
		if (consentGiven) {
			updateConsent(cookiePreferences);
		}

		return () => {
			window.removeEventListener('resize', checkMobile);
		};
	});

	const logout = async () => {
		try {
			// Call the server logout endpoint
			const response = await fetch('/api/logout', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error('Logout failed');
			}

			// Navigate to home page
			goto('/');

			// Reload to reset all client state
			setTimeout(() => {
				location.reload();
			}, 1000);
		} catch (error) {
			console.error('Logout error:', error);
		}
	};

	function checkMobile() {
		isMobile = window.innerWidth <= 768;
	}

	function toggleMenu() {
		if (isMobile) {
			isMenuOpen = !isMenuOpen;
			currentSubmenu = null;
		}
	}

	function openSubmenu(menu: string) {
		if (isMobile) {
			currentSubmenu = menu;
		}
	}

	function goBack() {
		if (isMobile) {
			currentSubmenu = null;
		}
	}

	function handleLinkClick() {
		if (isMobile) {
			isMenuOpen = false;
			currentSubmenu = null;
		}
	}
</script>

{#if !consentGiven}
	<div class="consent-banner">
		<p>
			www.clubfindr.com and 1 selected third parties collect personal information as specified in
			the
			<a
				href="/policies/privacy-policy"
				target="_blank"
				rel="noopener noreferrer"
				title="Privacy Policy"
			>
				Privacy Policy
			</a>
			and use cookies or similar technologies for technical purposes and, with your consent, for measurement
			as specified in the

			<a
				href="/policies/cookie-policy"
				target="_blank"
				rel="noopener noreferrer"
				title="Cookie Policy"
			>
				Cookie Policy
			</a>. You can freely give, deny, or withdraw your consent at any time by accessing the
			preferences panel. Denying consent may make related features unavailable. Use the "Accept"
			button to consent. Use the "Learn more and customize" button to customize or reject all
			cookies.
		</p>
		<button on:click={acceptConsent}>Accept All</button>

		<button on:click={openCustomModal}>Learn more and customize</button>
	</div>
{/if}

{#if showModal}
	<div class="modal">
		<div class="modal-content">
			<h2>Customize Cookie Preferences</h2>
			<label>
				<input type="checkbox" bind:checked={cookiePreferences.analytics} />
				Allow Analytics Cookies
			</label>
			<label>
				<input type="checkbox" bind:checked={cookiePreferences.marketing} />
				Allow Marketing Cookies
			</label>
			<label>
				<input type="checkbox" bind:checked={cookiePreferences.performance} />
				Allow Performance Cookies
			</label>
			<button class="save-button" on:click={savePreferences}>Save Preferences</button>
			<button class="decline-button" on:click={declineConsent}>Decline All</button>
			<button class="cancel-button" on:click={() => (showModal = false)}>Cancel</button>
		</div>
	</div>
{/if}

<header class="header-bar">
	<div class="logo">
		<a href="/" on:click={handleLinkClick}>
			<img src="/images/clubfindr.png" alt="ClubFindr Logo" />
		</a>
	</div>

	<!-- Only show hamburger in mobile view -->
	{#if isMobile}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="hamburger" on:click={toggleMenu}>
			<div />
			<div />
			<div />
		</div>
	{/if}

	<nav class="navigation {isMenuOpen ? 'active' : ''}">
		<!-- Desktop Menu -->
		{#if !isMobile}
			<div class="desktop-menu">
				{#if isLoggedIn}
					<div class="nav-link dropdown">
						<span>My Profile</span>
						<div class="dropdown-content">
							<a href="/users-home" on:click={handleLinkClick}>View Profile</a>
							<!-- svelte-ignore a11y-invalid-attribute -->
							<a
								href="#"
								on:click={() => {
									handleLinkClick();
									logout();
								}}>Log Out</a
							>
						</div>
					</div>
				{:else if isPartnerLoggedIn}
					<div class="nav-link dropdown">
						<span>Partner Menu</span>
						<div class="dropdown-content">
							<!-- svelte-ignore a11y-invalid-attribute -->
							<a
								href="#"
								on:click={() => {
									handleLinkClick();
									logout();
								}}>Log Out</a
							>
						</div>
					</div>
				{:else}
					<div class="nav-link dropdown">
						<span>Login</span>
						<div class="dropdown-content">
							<a href="/login/users" on:click={handleLinkClick}>User Login</a>
						</div>
					</div>
				{/if}

				{#if !isPartnerLoggedIn}
					<div class="nav-link dropdown">
						<span>Partners</span>
						<div class="dropdown-content">
							<a href="/login/bars" on:click={handleLinkClick}>Partner Login</a>
							<a href="/register" on:click={handleLinkClick}>Register Bar</a>
							<a href="/register/promoter" on:click={handleLinkClick}>Register as Promoter</a>
						</div>
					</div>
				{/if}

				<div class="nav-link dropdown">
					<span>About</span>
					<div class="dropdown-content">
						<a href="/about/blog" on:click={handleLinkClick}>Socials</a>
						<a href="/about/terms" on:click={handleLinkClick}>Terms & Policies</a>
						<a href="/about/us" on:click={handleLinkClick}>Who we are</a>
						<a href="/about/contact" on:click={handleLinkClick}>Contact</a>
					</div>
				</div>
			</div>
		{:else}
			<!-- Mobile Menu -->
			<div class="menu-level main-menu" class:hidden={currentSubmenu !== null}>
				<div class="menu-header">
					<h2>Menu</h2>
				</div>
				{#if isLoggedIn}
					<div
						class="nav-item"
						on:click={() => openSubmenu('profile')}
						on:keydown={(e) => e.key === 'Enter' && openSubmenu('profile')}
						role="button"
						tabindex="0"
					>
						<span>My Profile</span>
						<span class="arrow">→</span>
					</div>
				{:else if isPartnerLoggedIn}
					<div
						class="nav-item"
						on:click={() => openSubmenu('partner')}
						on:keydown={(e) => e.key === 'Enter' && openSubmenu('partner')}
						role="button"
						tabindex="0"
					>
						<span>Partner Menu</span>
						<span class="arrow">→</span>
					</div>
				{:else}
					<div
						class="nav-item"
						on:click={() => openSubmenu('login')}
						on:keydown={(e) => e.key === 'Enter' && openSubmenu('login')}
						role="button"
						tabindex="0"
					>
						<span>Login</span>
						<span class="arrow">→</span>
					</div>
				{/if}

				{#if !isPartnerLoggedIn}
					<div
						class="nav-item"
						on:click={() => openSubmenu('partners')}
						on:keydown={(e) => e.key === 'Enter' && openSubmenu('partners')}
						role="button"
						tabindex="0"
					>
						<span>Partners</span>
						<span class="arrow">→</span>
					</div>
				{/if}

				<div
					class="nav-item"
					on:click={() => openSubmenu('about')}
					on:keydown={(e) => e.key === 'Enter' && openSubmenu('about')}
					role="button"
					tabindex="0"
				>
					<span>About</span>
					<span class="arrow">→</span>
				</div>
			</div>

			<!-- Mobile Submenus -->
			{#if isLoggedIn}
				<div class="menu-level submenu" class:active={currentSubmenu === 'profile'}>
					<div class="submenu-header">
						<button class="back-button" on:click={goBack}>
							<span class="arrow">←</span>
							<span>Back</span>
						</button>
						<h2>My Profile</h2>
					</div>
					<a href="/users-home" class="nav-item" on:click={handleLinkClick}>View Profile</a>
					<!-- svelte-ignore a11y-invalid-attribute -->
					<a
						href="#"
						class="nav-item"
						on:click={() => {
							handleLinkClick();
							logout();
						}}>Log Out</a
					>
				</div>
			{:else if isPartnerLoggedIn}
				<div class="menu-level submenu" class:active={currentSubmenu === 'partner'}>
					<div class="submenu-header">
						<button class="back-button" on:click={goBack}>
							<span class="arrow">←</span>
							<span>Back</span>
						</button>
						<h2>Partner Menu</h2>
					</div>
					<!-- svelte-ignore a11y-invalid-attribute -->
					<a
						href="#"
						class="nav-item"
						on:click={() => {
							handleLinkClick();
							logout();
						}}>Log Out</a
					>
				</div>
			{:else}
				<div class="menu-level submenu" class:active={currentSubmenu === 'login'}>
					<div class="submenu-header">
						<button class="back-button" on:click={goBack}>
							<span class="arrow">←</span>
							<span>Back</span>
						</button>
						<h2>Login</h2>
					</div>
					<a href="/login/users" class="nav-item" on:click={handleLinkClick}>User Login</a>
				</div>
			{/if}

			<!-- Partners Submenu -->
			{#if !isPartnerLoggedIn}
				<div class="menu-level submenu" class:active={currentSubmenu === 'partners'}>
					<div class="submenu-header">
						<button class="back-button" on:click={goBack}>
							<span class="arrow">←</span>
							<span>Back</span>
						</button>
						<h2>Partners</h2>
					</div>
					<a href="/login/bars" class="nav-item" on:click={handleLinkClick}>Partner Login</a>
					<a href="/register" class="nav-item" on:click={handleLinkClick}>Register Bar</a>
					<a href="/register/promoter" class="nav-item" on:click={handleLinkClick}
						>Register as Promoter</a
					>
				</div>
			{/if}

			<!-- About Submenu -->
			<div class="menu-level submenu" class:active={currentSubmenu === 'about'}>
				<div class="submenu-header">
					<button class="back-button" on:click={goBack}>
						<span class="arrow">←</span>
						<span>Back</span>
					</button>
					<h2>About</h2>
				</div>
				<a href="/about/blog" class="nav-item" on:click={handleLinkClick}>Socials</a>
				<a href="/about/terms" class="nav-item" on:click={handleLinkClick}>Terms & Policies</a>
				<a href="/about/us" class="nav-item" on:click={handleLinkClick}>Who we are</a>
				<a href="/about/contact" class="nav-item" on:click={handleLinkClick}>Contact</a>
			</div>
		{/if}
	</nav>
</header>

<main class="content-container">
	<div class="md:container md:mx-auto text-light font-sen p-4 pt-8 md:p-16 text-center">
		<slot />
	</div>
</main>

<footer class="footer">
	<div class="footer-content">
		<div class="footer-links">
			<a href="/policies/privacy-policy" class="footer-link" on:click={handleLinkClick}>Privacy</a>
			<a href="/policies/terms-and-conditions" class="footer-link" on:click={handleLinkClick}
				>Terms</a
			>
			<a href="/policies/cookie-policy" class="footer-link" on:click={handleLinkClick}>Cookies</a>
			<a href="/about/contact" class="footer-link" on:click={handleLinkClick}>Contact</a>
		</div>
		<p class="copyright">&copy; {new Date().getFullYear()} Clubfindr. All rights reserved.</p>
	</div>
</footer>

<style>
	:global(html),
	:global(body) {
		height: 100%;
		margin: 0;
	}

	:global(body) {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}
	.content-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding-top: 70px;
	}

	.header-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 20px;
		background-color: #1a1a1a;
		color: white;
		position: fixed;
		width: 100%;
		top: 0;
		z-index: 1000;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		box-sizing: border-box;
	}

	.logo img {
		height: 40px;
	}

	.navigation {
		display: flex;
		gap: 20px;
	}

	.nav-link {
		color: white;
		text-decoration: none;
		font-size: 16px;
		font-weight: 500;
		transition: color 0.3s;
		position: relative;
	}

	.nav-link:hover {
		color: #4caf50;
	}

	.hamburger {
		display: none;
		flex-direction: column;
		justify-content: space-around;
		width: 30px;
		height: 30px;
		cursor: pointer;
		z-index: 1001;
	}

	.hamburger div {
		width: 100%;
		height: 4px;
		background-color: white;
		transition: all 0.3s ease;
	}
	.desktop-menu {
		display: flex;
		gap: 20px;
	}

	@media (max-width: 768px) {
		.navigation {
			display: none;
			position: fixed;
			top: 60px;
			left: 0;
			width: 100%;
			height: calc(100vh - 60px);
			background-color: #2927ab;
			z-index: 999;
			overflow-x: hidden;
			overflow-y: hidden;
		}

		.navigation.active {
			display: block;
		}

		.menu-level {
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-color: #2927ab;
			transition: transform 0.3s ease-in-out;
			overflow-y: auto;
		}

		.menu-level.hidden {
			display: none;
		}

		.submenu {
			transform: translateX(100%);
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			visibility: hidden;
		}

		.submenu.active {
			transform: translateX(0);
			visibility: visible;
		}

		.menu-header,
		.submenu-header {
			display: flex;
			align-items: center;
			padding: 15px;
			background-color: #1f1d8f;
			border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		}

		.menu-header h2,
		.submenu-header h2 {
			margin: 0;
			font-size: 18px;
			color: white;
			flex: 1;
			text-align: center;
		}

		.back-button {
			background: none;
			border: none;
			color: white;
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 5px;
			cursor: pointer;
			font-size: 16px;
		}

		.nav-item {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 15px;
			color: white;
			text-decoration: none;
			border-bottom: 1px solid rgba(255, 255, 255, 0.1);
			cursor: pointer;
		}

		.arrow {
			font-size: 18px;
		}

		/* Hide desktop-specific styles */
		.dropdown,
		.dropdown-content {
			display: none;
		}

		.hamburger {
			display: flex;
		}

		.footer-content {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 15px;
			padding: 15px;
		}

		.footer-links {
			display: flex;
			flex-wrap: wrap;
			justify-content: center;
			gap: 15px;
			color: #333;
			order: 1; /* Makes links appear first */
		}
		.footer {
			background-color: #f8f8f8;
			padding: 10px 0;
			margin-top: auto;
		}

		.footer p {
			margin: 0;
			color: #666;
		}
		.copyright {
			margin: 0;
			color: #666;
			order: 2; /* Makes copyright appear second */
		}
	}

	@media (min-width: 769px) {
		.navigation {
			display: flex;
			gap: 20px;
		}

		.dropdown {
			position: relative;
			cursor: pointer;
		}

		.dropdown-content {
			display: none;
			position: absolute;
			background-color: #1a1a1a;
			min-width: 200px;
			box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
			z-index: 1000;
			right: 0;
			top: 100%;
			border-radius: 4px;
		}

		.dropdown:hover .dropdown-content {
			display: block;
		}

		.dropdown-content a {
			color: white;
			padding: 12px 16px;
			text-decoration: none;
			display: block;
			border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		}

		.dropdown-content a:last-child {
			border-bottom: none;
		}

		.dropdown-content a:hover {
			background-color: #4caf50;
			color: white;
		}

		/* Hide mobile-specific elements */
		.back-button,
		.submenu-header,
		.arrow {
			display: none;
		}

		/* Reset mobile menu styles for desktop */
		.menu-level {
			position: static;
			height: auto;
			transform: none;
			background: none;
			overflow: visible;
		}

		.menu-level.main-menu {
			display: flex;
			gap: 20px;
			position: static;
			transform: none;
			visibility: visible;
		}

		.submenu {
			display: none !important; /* Hide mobile submenus on desktop */
		}

		/* Style for the main nav items */
		.nav-link {
			padding: 0;
			border: none;
		}

		.nav-link:hover {
			color: #4caf50;
		}

		.menu-level,
		.submenu,
		.menu-header,
		.submenu-header,
		.back-button,
		.nav-item,
		.arrow {
			display: none;
		}

		.consent-banner {
			position: fixed;
			bottom: 0;
			left: 50%;
			transform: translateX(-50%);
			width: 100%;
			background-color: rgba(0, 0, 0, 0.9);
			color: white;
			padding: 15px;
			text-align: center;
			z-index: 1000;
			box-sizing: border-box;
		}

		.consent-banner a {
			color: #2f855a;
			text-decoration: underline;
			cursor: pointer;
			font-weight: bold;
		}

		.consent-banner a:hover {
			color: #276749;
		}

		.consent-banner button {
			margin: 10px;
			padding: 10px 20px;
			background-color: #4caf50;
			color: white;
			border: none;
			cursor: pointer;
			border-radius: 5px;
		}

		.modal {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background: rgba(0, 0, 0, 0.5);
			display: flex;
			justify-content: center;
			align-items: center;
			z-index: 1001;
		}

		.modal-content {
			color: black;
			background: white;
			padding: 20px;
			border-radius: 8px;
			width: 400px;
			max-width: 80%;
		}

		.modal-content h2 {
			font-weight: bold;
			padding-bottom: 20px;
		}

		.modal-content button {
			margin: 10px;
			padding: 10px 20px;
			border-radius: 5px;
			border: none;
			cursor: pointer;
		}

		.modal-content .save-button {
			background-color: #4caf50;
			color: white;
		}

		.modal-content .decline-button {
			background-color: #e53e3e;
			color: white;
		}

		.modal-content .cancel-button {
			background-color: #1a202c;
			color: white;
		}

		label {
			display: block;
			margin-bottom: 10px;
		}

		.footer {
			background-color: #f8f8f8;
			padding: 10px 0;
			margin-top: auto;
		}

		.footer-content {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 0 20px;
		}

		.footer-links {
			display: flex;
			gap: 15px;
		}

		.footer-link {
			text-decoration: none;
			color: #333;
		}

		.footer-link:hover {
			text-decoration: underline;
		}

		.footer p {
			margin: 0;
			color: #666;
		}
	}
</style>
