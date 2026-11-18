// Every numbered palette colour used in a component must be defined in src/app.css's @theme.
// The theme resets the palette (`--color-*: initial`), so a utility like `bg-gray-700` whose
// token is missing generates no CSS at all and the element silently falls back to the page
// defaults — the /update-info city picker was white on white that way (DEVICE_CHECKLIST
// 2026-11-18). This scans the source like app_clubfindr's screenColours test does, so the
// mistake cannot come back. The full move to semantic tokens is KNOWN_ISSUES 7.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');
const APP_CSS = readFileSync(path.join(SRC, 'app.css'), 'utf8');

const definedTokens = new Set(
	[...APP_CSS.matchAll(/--color-([a-z_]+-\d{2,3})\s*:/g)].map(([, token]) => token)
);

function svelteFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) return svelteFiles(full);
		return entry.endsWith('.svelte') ? [full] : [];
	});
}

// bg-gray-700, hover:text-blue-600, from-gray-900, border-red-400, ...
const COLOURS =
	'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const USED = new RegExp(
	`(?:^|[\\s"'\`{:])(?:bg|text|border|from|via|to|ring|outline|fill|stroke|decoration|divide|accent|caret|shadow)-((?:${COLOURS})-\\d{2,3})(?![\\w-])`,
	'g'
);

describe('theme palette tokens', () => {
	it('defines every numbered colour the components use', () => {
		const missing = new Map<string, string[]>();
		for (const file of svelteFiles(SRC)) {
			const source = readFileSync(file, 'utf8');
			for (const [, token] of source.matchAll(USED)) {
				if (!definedTokens.has(token)) {
					const where = path.relative(SRC, file);
					missing.set(token, [...(missing.get(token) ?? []), where]);
				}
			}
		}
		expect(
			Object.fromEntries(missing),
			'add these to the @theme in src/app.css (the utility renders as nothing without it)'
		).toEqual({});
	});
});
