import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
	return {
		plugins: [sveltekit()],
		test: {
			include: ['src/**/*.{test,spec}.{js,ts}']
		},
		ssr: {
			noExternal: ['@googlemaps/js-api-loader']
		},
		optimizeDeps: {
			exclude: ['@mapbox/node-pre-gyp', 'bcrypt', 'pg-native', '@googlemaps/js-api-loader'],
			esbuildOptions: {
				loader: {
					'.html': 'text'
				},
				platform: 'node'
			}
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
		assetsInclude: ['**/*.html'],
		build: {
			rollupOptions: {
				external: ['@mapbox/node-pre-gyp', 'bcrypt', 'pg-native']
			},
			target: 'esnext',
			sourcemap: mode === 'development'
		},
		clearScreen: false,
		fs: {
			strict: true,
			allow: ['.']
		}
	};
});
