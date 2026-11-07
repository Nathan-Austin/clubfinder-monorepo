// Parsing of on/off flag values, with no SvelteKit imports, so the Playwright suite (which
// starts the server with the same environment) can read a flag exactly as the server does.
// The flags themselves live in featureFlags.ts.

const OFF_VALUES = new Set(['false', '0', 'off', 'no', 'disabled']);

/** Parses an on/off flag; anything but an explicit "off" value means on. */
export function isFlagEnabled(value: string | undefined, defaultValue = true): boolean {
	const normalized = value?.trim().toLowerCase();
	if (!normalized) return defaultValue;
	return !OFF_VALUES.has(normalized);
}
