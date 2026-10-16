import { config as dotenvConfig } from 'dotenv';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

dotenvConfig();

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	vitePlugin: {
		// Every component in this app is runes-based; compile them all in runes mode so any
		// leftover legacy syntax is a compile error. Dependencies keep their own mode.
		dynamicCompileOptions({ filename }) {
			if (!filename.includes('node_modules')) {
				return { runes: true };
			}
		}
	},
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
			// Form posts must come from the site itself or from these origins. Behind nginx the
			// server must know its public origin: set ORIGIN in .env (see .env.example), or the
			// check compares against http://<host> and rejects every form.
			trustedOrigins: ['https://clubfindr.com', 'https://www.clubfindr.com']
		}
	}
};

export default config;
