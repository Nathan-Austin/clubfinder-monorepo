module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'prettier',
		'plugin:svelte/recommended'
	],
	plugins: ['svelte', '@typescript-eslint'],
	globals: {
		google: 'readonly',
		FB: 'readonly'
	},
	ignorePatterns: ['*.cjs'],
	overrides: [
		{
			files: ['*.svelte'],
			parser: 'svelte-eslint-parser',
			parserOptions: {
				parser: '@typescript-eslint/parser'
			},
			rules: {
				'svelte/valid-compile': [
					'error',
					{
						ignoreWarnings: true
					}
				],
				'svelte/a11y-click-events-have-key-events': 'off',
				'svelte/a11y-no-static-element-interactions': 'off',
				'svelte/a11y-invalid-attribute': 'off'
			}
		}
	],
	settings: {
		'svelte/typescript': () => require('typescript')
	},
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020
	},
	env: {
		browser: true,
		es2017: true,
		node: true
	}
};
