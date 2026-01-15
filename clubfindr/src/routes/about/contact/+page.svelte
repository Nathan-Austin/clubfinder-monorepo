<script lang="ts">
	// Additional logic if needed
</script>

<svelte:head>
	<title>Contact Clubfindr - Discover Clubs and Bars Based on Music You Love</title>
	<meta
		name="description"
		content="How to contact Clubfindr, the platform that helps you find clubs and bars based on your favorite music styles and artists. Discover new places, meet people, and explore the nightlife in your city or any new city."
	/>
	<meta
		name="keywords"
		content="Clubfindr, contact, nightlife, clubs, bars, music, club recommendations, music venues, nightlife guide, find clubs, find bars"
	/>
	<meta name="author" content="Clubfindr Team" />
	<meta
		property="og:title"
		content="Contact Clubfindr - Discover Clubs and Bars Based on Music You Love"
	/>
	<meta
		property="og:description"
		content="How to contact Clubfindr, the app that helps you find clubs and bars that play the music you love. Whether you're looking for new spots in your city or exploring a new one, Clubfindr has got you covered."
	/>
	<meta property="og:image" content="/clubfindr.png" />
	<meta property="og:url" content="https://clubfindr.com/about/contact" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>
<div class="contact-container">
	<h1>Contact Us</h1>

	<div class="contact-section">
		<h2>General Inquiries</h2>
		<p>
			If you have any general questions about Clubfindr, need help navigating our platform, or have
			suggestions on how we can improve our services, feel free to reach out to us at:
		</p>
		<ul class="email-list">
			<li><a href="mailto:admin@clubfindr.com">admin@clubfindr.com</a></li>
		</ul>
	</div>

	<div class="contact-section">
		<h2>Sales & Partnerships</h2>
		<p>
			For businesses interested in partnering with Clubfindr, including clubs and bars looking to
			register, promote their events, or explore advertising options, please contact our sales team
			at:
		</p>
		<ul class="email-list">
			<li><a href="mailto:sales@clubfindr.com">sales@clubfindr.com</a></li>
		</ul>
	</div>

	<div class="contact-section">
		<h2>Customer Support</h2>
		<p>
			Having trouble with your account or experiencing technical issues? Our support team is here to
			help. Contact us for assistance with your profile, login, or any other issues at:
		</p>
		<ul class="email-list">
			<li><a href="mailto:support@clubfindr.com">support@clubfindr.com</a></li>
		</ul>
	</div>

	<div class="contact-section">
		<h2>Marketing & PR</h2>
		<p>
			For media inquiries, collaborations, or if you’re interested in working with Clubfindr for
			promotional opportunities, our marketing team can be reached at:
		</p>
		<ul class="email-list">
			<li><a href="mailto:marketing@clubfindr.com">marketing@clubfindr.com</a></li>
		</ul>
	</div>
</div>

<style>
	.contact-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		max-width: 800px;
		margin: 0 auto;
	}

	h1 {
		font-size: 2.5rem;
		margin-bottom: 1.5rem;
	}

	h2 {
		font-size: 1.8rem;
		margin-bottom: 0.5rem;
	}

	p {
		margin-bottom: 1rem;
		font-size: 1rem;
		line-height: 1.5;
	}

	.contact-section {
		margin-bottom: 2rem;
		text-align: center;
	}

	.email-list {
		list-style-type: none;
		padding: 0;
		font-size: 1rem;
	}

	.email-list li {
		margin-bottom: 0.5rem;
	}

	a {
		color: #1e88e5; /* Link color */
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}
</style>
