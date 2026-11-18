<!--
	Deleting the venue account from the web dashboard (Google Play's account-deletion policy
	covers venue accounts, and the policy asks for a way outside the app too). The server side
	is DELETE /api/bars/:barId ($lib/server/deleteVenue): everything the venue owns goes, in
	one transaction. Typing the venue's name arms the button, since this cannot be undone.
-->
<script lang="ts">
	import { goto } from '$app/navigation';

	interface Props {
		barId: string;
		barName: string;
	}

	let { barId, barName }: Props = $props();

	let open = $state(false);
	let typedName = $state('');
	let deleting = $state(false);
	let error = $state('');

	let armed = $derived(typedName.trim() === barName.trim() && barName.trim() !== '');

	async function deleteVenue() {
		if (!armed || deleting) return;
		deleting = true;
		error = '';
		try {
			const response = await fetch(`/api/bars/${barId}`, { method: 'DELETE' });
			if (response.ok) {
				// The server has cleared the venue cookies; nothing to come back to
				await goto('/', { invalidateAll: true });
				return;
			}
			const data = await response.json().catch(() => null);
			error = data?.message || 'Could not delete the venue account. Please try again.';
		} catch {
			error = 'Could not delete the venue account. Please check your connection and try again.';
		} finally {
			deleting = false;
		}
	}
</script>

<section class="delete-venue" data-testid="delete-venue">
	<h2>Delete this venue</h2>
	<p>
		Permanently deletes <strong>{barName}</strong> and everything it owns: its events, QR codes, check-in
		history, artists and genres, and every login. This cannot be undone. Your personal account is separate
		and stays.
	</p>

	{#if !open}
		<button class="danger-outline" onclick={() => (open = true)} data-testid="delete-venue-open">
			Delete venue account…
		</button>
	{:else}
		<label for="delete-venue-name"
			>Type the venue's name to confirm: <strong>{barName}</strong></label
		>
		<input
			id="delete-venue-name"
			type="text"
			bind:value={typedName}
			placeholder={barName}
			autocomplete="off"
			data-testid="delete-venue-name"
		/>
		<div class="actions">
			<button
				class="danger"
				onclick={deleteVenue}
				disabled={!armed || deleting}
				data-testid="delete-venue-confirm"
			>
				{deleting ? 'Deleting…' : 'Delete this venue for ever'}
			</button>
			<button
				class="cancel"
				onclick={() => {
					open = false;
					typedName = '';
					error = '';
				}}
				disabled={deleting}
			>
				Cancel
			</button>
		</div>
	{/if}

	{#if error}
		<p class="error" data-testid="delete-venue-error">{error}</p>
	{/if}
</section>

<style>
	.delete-venue {
		margin-top: 3rem;
		padding: 1.5rem;
		border: 1px solid #ffcdd2;
		border-radius: 8px;
		background-color: #fff8f8;
	}

	.delete-venue h2 {
		color: #c62828;
		font-size: 1.1rem;
		margin: 0 0 0.5rem;
	}

	.delete-venue p {
		color: #555;
		font-size: 0.9rem;
		margin: 0 0 1rem;
	}

	label {
		display: block;
		font-size: 0.9rem;
		color: #333;
		margin-bottom: 0.5rem;
	}

	input {
		display: block;
		width: 100%;
		max-width: 20rem;
		padding: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
	}

	.danger-outline {
		background-color: transparent;
		color: #c62828;
		border: 1px solid #c62828;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.danger-outline:hover {
		background-color: rgba(198, 40, 40, 0.08);
	}

	.danger {
		background-color: #c62828;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.danger:disabled {
		background-color: #e0a0a0;
		cursor: not-allowed;
	}

	.cancel {
		background-color: transparent;
		color: #555;
		border: 1px solid #ccc;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.error {
		color: #c62828;
		font-size: 0.9rem;
		margin-top: 0.75rem;
	}
</style>
