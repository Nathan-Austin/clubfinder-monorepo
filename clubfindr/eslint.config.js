import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default ts.config(
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'dist-scripts/',
			'node_modules/',
			'test-results/',
			'playwright-report/',
			'*.cjs'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				google: 'readonly',
				FB: 'readonly'
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		rules: {
			// Compiler warnings are reported by `pnpm check`; here they would be duplicated
			'svelte/valid-compile': ['error', { ignoreWarnings: true }],
			// New in eslint-plugin-svelte 3, switched off deliberately:
			// - resolve() on every href/goto() only matters with a non-empty paths.base
			'svelte/no-navigation-without-resolve': 'off',
			// - every each block is keyed; keep it that way
			'svelte/require-each-key': 'error',
			// - flags plain local Date/Set temporaries in component scripts, not just $state
			'svelte/prefer-svelte-reactivity': 'off'
		}
	}
);
