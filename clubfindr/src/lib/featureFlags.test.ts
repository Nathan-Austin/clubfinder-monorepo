import { describe, expect, it } from 'vitest';
import { isFlagEnabled } from './featureFlags';

describe('isFlagEnabled', () => {
	it('defaults to on when unset or blank', () => {
		expect(isFlagEnabled(undefined)).toBe(true);
		expect(isFlagEnabled('')).toBe(true);
		expect(isFlagEnabled('  ')).toBe(true);
		expect(isFlagEnabled(undefined, false)).toBe(false);
	});

	it('recognises the off spellings, case-insensitively', () => {
		for (const value of ['false', 'FALSE', '0', 'off', 'No', 'disabled', ' false ']) {
			expect(isFlagEnabled(value)).toBe(false);
		}
	});

	it('treats anything else as on', () => {
		for (const value of ['true', '1', 'on', 'yes', 'enabled', 'whatever']) {
			expect(isFlagEnabled(value)).toBe(true);
		}
	});
});
