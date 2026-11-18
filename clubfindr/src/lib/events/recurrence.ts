// When a venue's event actually happens (KNOWN_ISSUES 90).
//
// A recurring event is one `bar_events` row: a start `event_date`, `recurring`, and a
// `recurrence_pattern`. Nothing expanded it into dates, so a weekly night counted towards
// matching on its first date only and then vanished from `/barfindr` and from the venue's own
// list, though it was still in the database and still happening every week.
//
// This is the one place that says which days a series falls on. The venue's event lists, both
// matchers and `/barfindr` all read it, so an occurrence means the same thing everywhere.
//
// Dates are `YYYY-MM-DD` calendar days throughout ($lib/db parses Postgres DATE as text,
// KNOWN_ISSUES 17) and the arithmetic is done in UTC on those parts, so no server time zone can
// move a night to the day before.
//
// Monthly keeps the day of the month and skips months that do not have it: a series starting on
// the 31st happens in January and March, not on the 1st of March. Better a month missed than a
// night announced on a day the venue did not choose. Series have no end date in the schema, so
// callers pass the window they care about.

export const RECURRENCE_PATTERNS = ['daily', 'weekly', 'biweekly', 'monthly'] as const;
export type RecurrencePattern = (typeof RECURRENCE_PATTERNS)[number];

const INTERVAL_DAYS: Record<Exclude<RecurrencePattern, 'monthly'>, number> = {
	daily: 1,
	weekly: 7,
	biweekly: 14
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type RecurringEvent = {
	/** The first date of the series (a DATE column, so text; a Date is tolerated) */
	event_date: string | Date | null | undefined;
	recurring?: boolean | null;
	recurrence_pattern?: string | null;
};

/**
 * The pattern as stored, or null when it is missing or not one we expand. The app and the
 * dashboard both offer exactly these four; anything else (older free text) is treated as a
 * one-off rather than guessed at.
 */
export function normalizeRecurrencePattern(value: unknown): RecurrencePattern | null {
	if (typeof value !== 'string') return null;
	const cleaned = value
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, '-');
	const collapsed = cleaned.replace(/-/g, '');
	const match = RECURRENCE_PATTERNS.find((pattern) => pattern === collapsed);
	return match ?? null;
}

/** `YYYY-MM-DD` for a DATE value that may arrive as text or as a Date. */
export function toIsoDate(value: string | Date | null | undefined): string | null {
	if (!value) return null;
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return null;
		return [
			value.getUTCFullYear(),
			String(value.getUTCMonth() + 1).padStart(2, '0'),
			String(value.getUTCDate()).padStart(2, '0')
		].join('-');
	}
	const text = value.slice(0, 10);
	return ISO_DATE.test(text) ? text : null;
}

function utcMs(isoDate: string): number {
	const [, year, month, day] = ISO_DATE.exec(isoDate)!;
	return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function fromUtcMs(ms: number): string {
	const date = new Date(ms);
	return [
		date.getUTCFullYear(),
		String(date.getUTCMonth() + 1).padStart(2, '0'),
		String(date.getUTCDate()).padStart(2, '0')
	].join('-');
}

/** `isoDate` plus `days`, as a calendar day. */
export function addDays(isoDate: string, days: number): string {
	return fromUtcMs(utcMs(isoDate) + days * DAY_MS);
}

function seriesOf(
	event: RecurringEvent
): { start: string; pattern: RecurrencePattern | null } | null {
	const start = toIsoDate(event.event_date);
	if (!start) return null;
	const pattern = event.recurring ? normalizeRecurrencePattern(event.recurrence_pattern) : null;
	return { start, pattern };
}

/** Whether the event happens on `day` (`YYYY-MM-DD`). */
export function occursOn(event: RecurringEvent, day: string): boolean {
	const series = seriesOf(event);
	if (!series || !ISO_DATE.test(day)) return false;
	const { start, pattern } = series;
	if (day < start) return false;
	if (!pattern) return day === start;

	if (pattern === 'monthly') {
		return day.slice(8, 10) === start.slice(8, 10);
	}
	const elapsed = (utcMs(day) - utcMs(start)) / DAY_MS;
	return elapsed % INTERVAL_DAYS[pattern] === 0;
}

/**
 * Every day the event falls on within `[from, to]` (inclusive), soonest first, at most `limit`.
 * A one-off yields its own date when it is in the window.
 */
export function occurrencesBetween(
	event: RecurringEvent,
	from: string,
	to: string,
	limit = Number.MAX_SAFE_INTEGER
): string[] {
	const series = seriesOf(event);
	if (!series || !ISO_DATE.test(from) || !ISO_DATE.test(to) || to < from || limit <= 0) return [];
	const { start, pattern } = series;

	if (!pattern) return start >= from && start <= to ? [start] : [];

	const dates: string[] = [];
	if (pattern === 'monthly') {
		const dayOfMonth = Number(start.slice(8, 10));
		let year = Number(from.slice(0, 4));
		let month = Number(from.slice(5, 7)) - 1; // 0-based
		if (from < start) {
			year = Number(start.slice(0, 4));
			month = Number(start.slice(5, 7)) - 1;
		}
		while (dates.length < limit) {
			const candidate = fromUtcMs(Date.UTC(year, month, dayOfMonth));
			// Date.UTC rolls a missing day into the next month (31 Feb -> 3 Mar); such a month
			// simply has no occurrence
			const landedInSameMonth = Number(candidate.slice(5, 7)) - 1 === month;
			if (candidate > to) break;
			if (landedInSameMonth && candidate >= from && candidate >= start) dates.push(candidate);
			month += 1;
			if (month > 11) {
				month = 0;
				year += 1;
			}
			// A guard against a pathological window; a month is never skipped twice in a row
			if (year > Number(to.slice(0, 4)) + 1) break;
		}
		return dates;
	}

	const interval = INTERVAL_DAYS[pattern];
	let current = start;
	if (current < from) {
		const elapsed = (utcMs(from) - utcMs(start)) / DAY_MS;
		current = addDays(start, Math.ceil(elapsed / interval) * interval);
	}
	while (current <= to && dates.length < limit) {
		dates.push(current);
		current = addDays(current, interval);
	}
	return dates;
}

/** The first day on or after `from` that the event falls on, or null within `withinDays`. */
export function nextOccurrence(
	event: RecurringEvent,
	from: string,
	withinDays = 366
): string | null {
	const [first] = occurrencesBetween(event, from, addDays(from, withinDays), 1);
	return first ?? null;
}

/**
 * One entry per occurrence, for the lists that show a venue's events. Each keeps its row's
 * fields with `event_date` set to the occurrence, plus `series_id` (the row it came from) and
 * `occurrence_id` (`<row id>:<date>`), which lists can key on: a series now appears more than
 * once. Sorted by date, then by start time.
 *
 * `to` bounds the repeating series only, because they have no end: a one-off keeps being listed
 * however far ahead it is, as it always was (a venue planning next summer's festival still sees
 * it).
 */
export function expandOccurrences<
	T extends RecurringEvent & { id?: unknown; start_time?: unknown }
>(
	events: readonly T[],
	{
		from,
		to,
		perSeries = Number.MAX_SAFE_INTEGER
	}: { from: string; to: string; perSeries?: number }
): (T & { event_date: string; series_id: string; occurrence_id: string })[] {
	const expanded = events.flatMap((event) => {
		const series = seriesOf(event);
		if (!series) return [];
		const dates = series.pattern
			? occurrencesBetween(event, from, to, perSeries)
			: series.start >= from
				? [series.start]
				: [];
		return dates.map((date) => ({
			...event,
			event_date: date,
			series_id: String(event.id ?? ''),
			occurrence_id: `${String(event.id ?? '')}:${date}`
		}));
	});

	return expanded.sort((a, b) => {
		if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
		const aTime = typeof a.start_time === 'string' ? a.start_time : '';
		const bTime = typeof b.start_time === 'string' ? b.start_time : '';
		return aTime.localeCompare(bTime);
	});
}
