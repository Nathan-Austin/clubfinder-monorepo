import { describe, expect, it } from 'vitest';
import {
	addDays,
	expandOccurrences,
	nextOccurrence,
	normalizeRecurrencePattern,
	occursOn,
	occurrencesBetween,
	toIsoDate
} from './recurrence';

// KNOWN_ISSUES 90: a recurring event is one row with a start date and a pattern, and nothing
// expanded it into dates, so a weekly night counted on its first date only.

const weekly = { event_date: '2026-11-06', recurring: true, recurrence_pattern: 'weekly' };
const oneOff = { event_date: '2026-11-06', recurring: false, recurrence_pattern: null };

describe('normalizeRecurrencePattern', () => {
	it('takes the four patterns the forms offer, however they are written', () => {
		expect(normalizeRecurrencePattern('daily')).toBe('daily');
		expect(normalizeRecurrencePattern('Bi-weekly')).toBe('biweekly');
		expect(normalizeRecurrencePattern(' BIWEEKLY ')).toBe('biweekly');
		expect(normalizeRecurrencePattern('bi weekly')).toBe('biweekly');
		expect(normalizeRecurrencePattern('monthly')).toBe('monthly');
	});

	it('refuses anything else rather than guessing', () => {
		for (const value of ['every other tuesday', '', null, 7, 'fortnightly']) {
			expect(normalizeRecurrencePattern(value)).toBeNull();
		}
	});
});

describe('toIsoDate', () => {
	it('reads a DATE as text or as a Date, in UTC', () => {
		expect(toIsoDate('2026-11-06')).toBe('2026-11-06');
		expect(toIsoDate('2026-11-06T00:00:00.000Z')).toBe('2026-11-06');
		expect(toIsoDate(new Date(Date.UTC(2026, 10, 6)))).toBe('2026-11-06');
		expect(toIsoDate(null)).toBeNull();
		expect(toIsoDate('not a date')).toBeNull();
	});
});

describe('occursOn', () => {
	it('puts a one-off on its own day and nowhere else', () => {
		expect(occursOn(oneOff, '2026-11-06')).toBe(true);
		expect(occursOn(oneOff, '2026-11-13')).toBe(false);
	});

	it('repeats a weekly night every seven days, never before it starts', () => {
		expect(occursOn(weekly, '2026-11-06')).toBe(true);
		expect(occursOn(weekly, '2026-11-13')).toBe(true);
		expect(occursOn(weekly, '2027-01-01')).toBe(true); // 8 weeks on
		expect(occursOn(weekly, '2026-11-12')).toBe(false);
		expect(occursOn(weekly, '2026-10-30')).toBe(false);
	});

	it('handles daily, biweekly and monthly', () => {
		const daily = { event_date: '2026-11-06', recurring: true, recurrence_pattern: 'daily' };
		const biweekly = { event_date: '2026-11-06', recurring: true, recurrence_pattern: 'biweekly' };
		const monthly = { event_date: '2026-11-06', recurring: true, recurrence_pattern: 'monthly' };
		expect(occursOn(daily, '2026-11-09')).toBe(true);
		expect(occursOn(biweekly, '2026-11-20')).toBe(true);
		expect(occursOn(biweekly, '2026-11-13')).toBe(false);
		expect(occursOn(monthly, '2027-03-06')).toBe(true);
		expect(occursOn(monthly, '2027-03-07')).toBe(false);
	});

	it('treats a pattern it does not know as a one-off', () => {
		const odd = {
			event_date: '2026-11-06',
			recurring: true,
			recurrence_pattern: 'every full moon'
		};
		expect(occursOn(odd, '2026-11-06')).toBe(true);
		expect(occursOn(odd, '2026-11-13')).toBe(false);
	});

	it('is unaffected by the server time zone', () => {
		// The arithmetic is on the date parts in UTC, so a day never slips to the one before
		const original = process.env.TZ;
		try {
			process.env.TZ = 'Pacific/Auckland';
			expect(occursOn(weekly, '2026-11-13')).toBe(true);
			process.env.TZ = 'America/Los_Angeles';
			expect(occursOn(weekly, '2026-11-13')).toBe(true);
		} finally {
			process.env.TZ = original;
		}
	});
});

describe('occurrencesBetween', () => {
	it('lists a weekly night inside the window only', () => {
		expect(occurrencesBetween(weekly, '2026-11-10', '2026-12-05')).toEqual([
			'2026-11-13',
			'2026-11-20',
			'2026-11-27',
			'2026-12-04'
		]);
	});

	it('stops at the limit', () => {
		expect(occurrencesBetween(weekly, '2026-11-06', '2027-12-31', 2)).toEqual([
			'2026-11-06',
			'2026-11-13'
		]);
	});

	it('keeps the day of the month and skips months without it', () => {
		const monthly = { event_date: '2027-01-31', recurring: true, recurrence_pattern: 'monthly' };
		// No 31 February, no 31 April: those months have no occurrence
		expect(occurrencesBetween(monthly, '2027-01-01', '2027-05-31')).toEqual([
			'2027-01-31',
			'2027-03-31',
			'2027-05-31'
		]);
	});

	it('crosses a leap day without drifting', () => {
		const daily = { event_date: '2028-02-27', recurring: true, recurrence_pattern: 'daily' };
		expect(occurrencesBetween(daily, '2028-02-27', '2028-03-01')).toEqual([
			'2028-02-27',
			'2028-02-28',
			'2028-02-29',
			'2028-03-01'
		]);
	});

	it('gives a one-off outside the window nothing', () => {
		expect(occurrencesBetween(oneOff, '2026-11-07', '2026-12-31')).toEqual([]);
	});
});

// KNOWN_ISSUES 89: a venue closing on one date of a series had to delete the whole series
describe('cancelled dates', () => {
	const weeklyWithSkip = { ...weekly, skip_dates: ['2026-11-20'] };

	it('leaves a cancelled date out of the series', () => {
		expect(occursOn(weeklyWithSkip, '2026-11-13')).toBe(true);
		expect(occursOn(weeklyWithSkip, '2026-11-20')).toBe(false);
		expect(occursOn(weeklyWithSkip, '2026-11-27')).toBe(true);
	});

	it('leaves it out of the listing, keeping the rest', () => {
		expect(occurrencesBetween(weeklyWithSkip, '2026-11-10', '2026-12-05')).toEqual([
			'2026-11-13',
			'2026-11-27',
			'2026-12-04'
		]);
	});

	it('can cancel a one-off too', () => {
		expect(
			occurrencesBetween({ ...oneOff, skip_dates: ['2026-11-06'] }, '2026-11-01', '2026-11-30')
		).toEqual([]);
	});

	it('moves on to the next date', () => {
		expect(nextOccurrence(weeklyWithSkip, '2026-11-14')).toBe('2026-11-27');
	});

	it('leaves a cancelled date out of the expanded list', () => {
		const rows = [{ id: 'a', ...weeklyWithSkip }];
		expect(
			expandOccurrences(rows, { from: '2026-11-10', to: '2026-11-30' }).map((e) => e.event_date)
		).toEqual(['2026-11-13', '2026-11-27']);
	});
});

describe('nextOccurrence', () => {
	it('finds the next date of a series that started in the past', () => {
		expect(nextOccurrence(weekly, '2026-11-18')).toBe('2026-11-20');
	});

	it('is the event itself for an upcoming one-off, and null once it has passed', () => {
		expect(nextOccurrence(oneOff, '2026-11-01')).toBe('2026-11-06');
		expect(nextOccurrence(oneOff, '2026-11-07')).toBeNull();
	});
});

describe('expandOccurrences', () => {
	it('gives one entry per occurrence, sorted, each with its own key', () => {
		const rows = [
			{ id: 'a', ...weekly, start_time: '23:00:00' },
			{ id: 'b', event_date: '2026-11-14', recurring: false, start_time: '21:00:00' }
		];
		const expanded = expandOccurrences(rows, { from: '2026-11-10', to: '2026-11-21' });
		expect(expanded.map((event) => `${event.event_date} ${event.series_id}`)).toEqual([
			'2026-11-13 a',
			'2026-11-14 b',
			'2026-11-20 a'
		]);
		expect(expanded[0].occurrence_id).toBe('a:2026-11-13');
		expect(expanded[0].start_time).toBe('23:00:00');
	});

	// The window bounds the endless series; a one-off keeps its place however far ahead it is
	it('keeps a one-off beyond the window', () => {
		const rows = [{ id: 'far', event_date: '2031-06-22', recurring: false }];
		expect(
			expandOccurrences(rows, { from: '2026-11-18', to: '2027-01-17' }).map((e) => e.event_date)
		).toEqual(['2031-06-22']);
	});

	it('caps how many dates one series contributes', () => {
		const rows = [{ id: 'a', ...weekly }];
		expect(
			expandOccurrences(rows, { from: '2026-11-06', to: '2027-02-01', perSeries: 3 })
		).toHaveLength(3);
	});

	it('sorts same-day events by start time', () => {
		const rows = [
			{ id: 'late', event_date: '2026-11-20', recurring: false, start_time: '23:00:00' },
			{ id: 'early', event_date: '2026-11-20', recurring: false, start_time: '20:00:00' }
		];
		expect(
			expandOccurrences(rows, { from: '2026-11-01', to: '2026-11-30' }).map((e) => e.series_id)
		).toEqual(['early', 'late']);
	});
});

describe('addDays', () => {
	it('moves calendar days, across months and years', () => {
		expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
	});
});
