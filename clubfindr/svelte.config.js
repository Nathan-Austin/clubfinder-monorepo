import { config as dotenvConfig } from 'dotenv';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

dotenvConfig();

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			out: 'build',
			precompress: true,
			envPrefix: ''
		}),
		paths: {
			base: '',
			assets: ''
		},
		csrf: {
			checkOrigin: false // Only if you're sure about your security setup
		}
	}
};

export default config;
