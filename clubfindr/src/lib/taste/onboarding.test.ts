import { describe, expect, it } from 'vitest';
import { needsOnboarding, ONBOARDING_MAX_ARTISTS, ONBOARDING_MIN_ARTISTS } from './onboarding';

describe('onboarding limits', () => {
	it('asks for 3 to 5 artists', () => {
		expect(ONBOARDING_MIN_ARTISTS).toBe(3);
		expect(ONBOARDING_MAX_ARTISTS).toBe(5);
	});
});

describe('needsOnboarding', () => {
	it('is true below the minimum and false from it on, with no upper bound', () => {
		expect(needsOnboarding(0)).toBe(true);
		expect(needsOnboarding(ONBOARDING_MIN_ARTISTS - 1)).toBe(true);
		expect(needsOnboarding(ONBOARDING_MIN_ARTISTS)).toBe(false);
		expect(needsOnboarding(ONBOARDING_MAX_ARTISTS + 20)).toBe(false);
	});
});
