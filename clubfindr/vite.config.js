import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Packages that must never reach the browser. bcryptjs once got there through
// $lib/passwordUtils; this fails `vite build` if any of them shows up in a client chunk.
const serverOnlyPackages = ['bcryptjs', 'pg', 'nodemailer', 'jsonwebtoken'];

/** @returns {import('vite').Plugin} */
function forbidInClientBundle(packages) {
	let ssr = false;
	return {
		name: 'clubfindr:forbid-in-client-bundle',
		apply: 'build',
		configResolved(config) {
			ssr = !!config.build.ssr;
		},
		generateBundle(_options, bundle) {
			if (ssr) return;
			const offenders = new Set();
			for (const [file, chunk] of Object.entries(bundle)) {
				if (chunk.type !== 'chunk') continue;
				const ids = chunk.moduleIds ?? Object.keys(chunk.modules ?? {});
				for (const id of ids) {
					const pkg = packages.find((p) => id.includes(`/node_modules/${p}/`));
					if (pkg) offenders.add(`${pkg} (via ${id.split('/node_modules/').pop()}) in ${file}`);
				}
			}
			if (offenders.size) {
				throw new Error(
					`Server-only package in the client bundle:\n  ${[...offenders].join('\n  ')}\n` +
						'Move the code that needs it under src/lib/server/.'
				);
			}
		}
	};
}

export default defineConfig(({ mode }) => {
	return {
		plugins: [tailwindcss(), sveltekit(), forbidInClientBundle(serverOnlyPackages)],
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
