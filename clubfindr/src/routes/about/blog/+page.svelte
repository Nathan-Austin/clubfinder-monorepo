<script lang="ts">
	const socialMediaLinks = [
		{
			name: 'Instagram',
			url: 'https://www.instagram.com/clubfindr',
			icon: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png',
			handle: '@clubfindr'
		},
		{
			name: 'X',
			url: 'https://twitter.com/clubfindr_',
			icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/X_logo_2023.svg/300px-X_logo_2023.svg.png', // Official Twitter/X logo from Twitter's assets
			handle: '@clubfindr_'
		},
		{
			name: 'LinkedIn',
			url: 'https://www.linkedin.com/company/clubfindr',
			icon: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/LinkedIn_logo_initials.png',
			handle: 'Clubfindr'
		},
		{
			name: 'Facebook',
			url: 'https://www.facebook.com/clubfindr',
			icon: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg',
			handle: 'Clubfindr'
		},
		{
			name: 'YouTube',
			url: 'https://www.youtube.com/@clubfindr',
			icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/YouTube_Logo_2017.svg/512px-YouTube_Logo_2017.svg.png',
			handle: '@clubfindr'
		}
	];
</script>

<svelte:head>
	<title>Clubfindr socials- Discover Clubs and Bars Based on Music You Love</title>
	<meta
		name="description"
		content="Follow Clubfindr, the platform that helps you find clubs and bars based on your favorite music styles and artists. Discover new places, meet people, and explore the nightlife in your city or any new city."
	/>
	<meta
		name="keywords"
		content="Clubfindr, nightlife, clubs, bars, music, club recommendations, music venues, nightlife guide, find clubs, find bars, YouTube, Instagram, X, Twitter,, Facebook"
	/>
	<meta name="author" content="Clubfindr Team" />
	<meta
		property="og:title"
		content="Follow Clubfindr - Follow us to keep up with whats new and Discover Clubs and Bars Based on Music You Love"
	/>
	<meta
		property="og:description"
		content="Clubfindr helps you find clubs and bars that play the music you love. Whether you're looking for new spots in your city or exploring a new one, Clubfindr has got you covered."
	/>
	<meta property="og:image" content="/clubfindr.png" />
	<meta property="og:url" content="https://clubfindr.com/about/blog" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<section>
	<h1>Follow Clubfindr on Social Media</h1>
	<div class="follow-us-message">
		<p>
			Stay up to date with the latest news, events, and announcements from Clubfindr! Follow us on
			our social media platforms and never miss out on any updates.
		</p>
		<p>
			Get exclusive insights into new clubs, events, and special promotions happening near you. Join
			the community and connect with us today!
		</p>
	</div>

	<div class="social-links">
		{#each socialMediaLinks as social (social.name)}
			<div class="social-card">
				<img src={social.icon} alt={social.name + ' logo'} />
				<h3>{social.name}</h3>
				<p>{social.handle}</p>
				<a href={social.url} target="_blank" rel="noopener noreferrer">Visit {social.name}</a>
			</div>
		{/each}
	</div>
</section>

<style>
	.social-links {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		margin: 20px;
	}
	.social-card {
		border: 1px solid #ddd;
		border-radius: 10px;
		width: 200px;
		height: 200px;
		margin: 15px;
		padding: 20px;
		text-align: center;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		transition: transform 0.2s;
		background-color: bisque;
	}
	.social-card:hover {
		transform: scale(1.05);
	}
	.social-card img {
		width: auto;
		height: 50px;
		margin-bottom: 15px;
	}
	.social-card h3 {
		font-size: 1.2rem;
		margin-bottom: 10px;
		color: black;
	}
	.social-card p {
		color: black;
	}
	.social-card a {
		text-decoration: none;
		color: #0070f3;
		font-weight: bold;
	}
	.follow-us-message {
		text-align: center;
		margin: 30px 20px;
		font-size: 1.2rem;
		line-height: 1.5;
	}
</style>
