/**
 * Calendar dates as the user sees them.
 *
 * `Date#toISOString()` gives the UTC day, so a date picked late in the evening west of UTC or
 * early in the morning east of it lands on the wrong day (KNOWN_ISSUES #1). These two functions
 * only ever use the local date parts.
 */

/** The local calendar date of `date` as `YYYY-MM-DD`. */
export function toLocalIsoDate(date: Date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** Local midnight of a `YYYY-MM-DD` date (`new Date('YYYY-MM-DD')` would be UTC midnight). */
export function fromLocalIsoDate(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, m - 1, d);
}
