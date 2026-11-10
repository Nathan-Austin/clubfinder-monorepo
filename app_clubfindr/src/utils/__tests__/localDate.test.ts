import { fromLocalIsoDate, toLocalIsoDate } from '../localDate';

// The bug these guard against only shows west of UTC, where `new Date('2031-06-21')` (UTC
// midnight) is still the 20th locally. Node re-reads TZ when it is assigned, so each case
// runs in its own zone.
const ZONES = ['America/Los_Angeles', 'Europe/Berlin', 'Pacific/Auckland', 'UTC'];
const originalTz = process.env.TZ;

afterAll(() => {
    process.env.TZ = originalTz;
});

describe.each(ZONES)('in %s', (zone) => {
    beforeEach(() => {
        process.env.TZ = zone;
    });

    it('reads a YYYY-MM-DD date as that local day', () => {
        const date = fromLocalIsoDate('2031-06-21');
        expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2031, 5, 21]);
        expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);
    });

    it('round-trips a date unchanged, across a year boundary and a leap day', () => {
        for (const value of ['2031-06-21', '2030-12-31', '2031-01-01', '2032-02-29']) {
            expect(toLocalIsoDate(fromLocalIsoDate(value))).toBe(value);
        }
    });

    it('writes the local calendar date', () => {
        expect(toLocalIsoDate(new Date(2031, 0, 5, 23, 30))).toBe('2031-01-05');
    });
});

it('falls back to Date parsing for anything that is not a plain date', () => {
    const value = '2031-06-21T12:00:00.000Z';
    expect(fromLocalIsoDate(value).getTime()).toBe(new Date(value).getTime());
});
