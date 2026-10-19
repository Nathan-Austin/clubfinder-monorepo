import { afterAll, describe, expect, it } from 'vitest';
import { fromLocalIsoDate, toLocalIsoDate } from './localDate';

// Node re-reads process.env.TZ on every Date call, so each case sets the zone it needs.
const originalTz = process.env.TZ;
afterAll(() => {
	if (originalTz === undefined) delete process.env.TZ;
	else process.env.TZ = originalTz;
});

const zones = [
	// 00:30 on 18 Oct in Auckland (NZDT, UTC+13) is 11:30 UTC on 17 Oct
	{ tz: 'Pacific/Auckland', instant: '2026-10-17T11:30:00Z', local: '2026-10-18' },
	// 20:00 on 17 Oct in Los Angeles (PDT, UTC-7) is 03:00 UTC on 18 Oct
	{ tz: 'America/Los_Angeles', instant: '2026-10-18T03:00:00Z', local: '2026-10-17' },
	{ tz: 'UTC', instant: '2026-10-17T23:59:59Z', local: '2026-10-17' }
];

describe('toLocalIsoDate', () => {
	for (const { tz, instant, local } of zones) {
		it(`uses the local calendar date in ${tz}`, () => {
			process.env.TZ = tz;
			const date = new Date(instant);
			expect(toLocalIsoDate(date)).toBe(local);
			// the UTC day is what the old code sent; it must differ unless the zone is UTC
			if (tz !== 'UTC') expect(date.toISOString().substring(0, 10)).not.toBe(local);
		});
	}

	it('zero-pads month and day', () => {
		process.env.TZ = 'UTC';
		expect(toLocalIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
	});
});

describe('fromLocalIsoDate', () => {
	for (const { tz, local } of zones) {
		it(`gives local midnight of that day in ${tz}`, () => {
			process.env.TZ = tz;
			const date = fromLocalIsoDate(local);
			expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual(
				local.split('-').map(Number)
			);
			expect(date.getHours()).toBe(0);
			// round trip
			expect(toLocalIsoDate(date)).toBe(local);
		});
	}
});
