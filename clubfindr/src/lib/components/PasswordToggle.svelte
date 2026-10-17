<!--
	Show/hide button for a password field. Wrap the page's own <input type="password">:

		<PasswordToggle><input type="password" bind:value={password} /></PasswordToggle>

	The input stays in the page's markup, so the page's scoped styles still apply to it.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	let wrapper: HTMLSpanElement | undefined = $state();
	let visible = $state(false);
	let iconColor = $state('#6b7280');

	const input = () => wrapper?.querySelector('input') ?? null;

	$effect(() => {
		// Match the field's text colour so the icon shows on light and dark inputs
		const el = input();
		if (el) iconColor = getComputedStyle(el).color;
	});

	function toggle() {
		const el = input();
		if (!el) return;
		visible = !visible;
		el.type = visible ? 'text' : 'password';
	}
</script>

<span class="password-toggle" bind:this={wrapper}>
	{@render children()}
	<button
		type="button"
		class="toggle"
		style:color={iconColor}
		onclick={toggle}
		aria-label={visible ? 'Hide password' : 'Show password'}
		aria-pressed={visible}
		title={visible ? 'Hide password' : 'Show password'}
	>
		{#if visible}
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20"
				/>
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
				<circle cx="12" cy="12" r="3" />
			</svg>
		{/if}
	</button>
</span>

<style>
	.password-toggle {
		position: relative;
		display: block;
		width: 100%;
	}

	/* Room for the button, and a constant width when the type flips to text */
	.password-toggle > :global(input) {
		width: 100%;
		box-sizing: border-box;
		padding-right: 2.75rem;
	}

	.toggle {
		position: absolute;
		top: 0;
		bottom: 0;
		right: 0.5rem;
		margin: auto 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 0;
		border-radius: 4px;
		background: transparent;
		opacity: 0.7;
		cursor: pointer;
	}

	.toggle:hover,
	.toggle:focus-visible {
		opacity: 1;
	}

	.toggle:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 1px;
	}

	svg {
		width: 1.25rem;
		height: 1.25rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
