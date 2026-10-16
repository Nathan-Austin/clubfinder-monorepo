<!-- src/routes/+error.svelte -->
<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="error-container">
	<h1>{page.status} Error</h1>
	<p>{page.error?.message || 'Something went wrong'}</p>
	<a href="/">Go back home</a>
</div>

<style>
	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		text-align: center;
		padding: 1rem;
	}

	h1 {
		font-size: 2rem;
		margin-bottom: 1rem;
	}

	a {
		margin-top: 1rem;
		color: #4caf50;
		text-decoration: underline;
	}

	a:hover {
		color: #45a049;
	}
</style>
