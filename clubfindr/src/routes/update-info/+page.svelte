<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';

	let formData = {
		name: '',
		email: '',
		password: '',
		newPassword: '',
		confirmNewPassword: ''
	};

	let errorMessage = '';
	let successMessage = '';

	const validateForm = () => {
		errorMessage = '';

		// Validate email format if provided
		if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
			errorMessage = 'Invalid email format';
			return false;
		}

		// Validate new password match if provided
		if (formData.newPassword && formData.newPassword !== formData.confirmNewPassword) {
			errorMessage = 'New passwords do not match';
			return false;
		}

		// Ensure current password is provided
		if (!formData.password) {
			errorMessage = 'Current password is required';
			return false;
		}

		return true;
	};
</script>

<svelte:head>
	<title>Update Profile - Clubfindr</title>
	<meta name="description" content="Update your Clubfindr profile information" />
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<h1
		class="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-br from-light via-light to-secondary"
	>
		Update Profile
	</h1>

	<form
		method="POST"
		use:enhance={() => {
			return ({ result }) => {
				if (result.type === 'success') {
					successMessage = 'Profile updated successfully';
					setTimeout(() => {
						goto('/users-home');
					}, 2000);
				} else if (result.type === 'error') {
					errorMessage = result.error.message || 'Failed to update profile';
				}
			};
		}}
		on:submit|preventDefault={() => {
			if (!validateForm()) {
				return false;
			}
		}}
		class="max-w-md mx-auto"
	>
		<div class="mb-6">
			<label for="name" class="block mb-2">Name</label>
			<input
				type="text"
				id="name"
				name="name"
				bind:value={formData.name}
				class="w-full p-2 rounded bg-gray-700 border border-gray-600"
				placeholder="Enter your name"
			/>
		</div>

		<div class="mb-6">
			<label for="email" class="block mb-2">Email</label>
			<input
				type="email"
				id="email"
				name="email"
				bind:value={formData.email}
				class="w-full p-2 rounded bg-gray-700 border border-gray-600"
				placeholder="Enter your email"
			/>
		</div>

		<div class="mb-6">
			<label for="current-password" class="block mb-2">Current Password</label>
			<input
				type="password"
				id="current-password"
				name="password"
				bind:value={formData.password}
				class="w-full p-2 rounded bg-gray-700 border border-gray-600"
				placeholder="Enter current password"
				required
			/>
		</div>

		<div class="mb-6">
			<label for="new-password" class="block mb-2">New Password (optional)</label>
			<input
				type="password"
				id="new-password"
				name="newPassword"
				bind:value={formData.newPassword}
				class="w-full p-2 rounded bg-gray-700 border border-gray-600"
				placeholder="Enter new password"
			/>
		</div>

		<div class="mb-6">
			<label for="confirm-password" class="block mb-2">Confirm New Password</label>
			<input
				type="password"
				id="confirm-password"
				name="confirmNewPassword"
				bind:value={formData.confirmNewPassword}
				class="w-full p-2 rounded bg-gray-700 border border-gray-600"
				placeholder="Confirm new password"
			/>
		</div>

		{#if errorMessage}
			<div class="mb-4 p-3 bg-red-500 text-white rounded">
				{errorMessage}
			</div>
		{/if}

		{#if successMessage}
			<div class="mb-4 p-3 bg-green-500 text-white rounded">
				{successMessage}
			</div>
		{/if}

		<div class="flex justify-between">
			<button
				type="submit"
				class="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
			>
				Update Profile
			</button>
			<button
				type="button"
				class="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
				on:click={() => goto('/users-home')}
			>
				Cancel
			</button>
		</div>
	</form>
</div>

<style>
	input::placeholder {
		color: #9ca3af;
	}

	input {
		color: white;
	}
</style>
