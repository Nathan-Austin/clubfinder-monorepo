import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
	return {
		plugins: [tailwindcss(), sveltekit()],
		test: {
			include: ['src/**/*.{test,spec}.{js,ts}']
		},
		ssr: {
			noExternal: ['@googlemaps/js-api-loader']
		},
		optimizeDeps: {
			exclude: ['@googlemaps/js-api-loader']
		},
		server: {
			port: 3000,
			host: true,
			hmr: true,
			watch: {
				ignored: [
					'**/node_modules/**',
					'**/.git/**',
					'**/.svelte-kit/**',
					'**/timestamp-*',
					'**/*.timestamp-*',
					'**/vite.config.js.timestamp-*',
					'**/*.tmp*',
					'**/dist/**'
				],
				usePolling: false,
				followSymlinks: false
			}
		},
		build: {
			target: 'esnext',
			sourcemap: mode === 'development'
		},
		clearScreen: false
	};
});
