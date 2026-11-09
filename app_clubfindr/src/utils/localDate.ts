/**
 * Calendar dates as the venue sees them.
 *
 * The API sends an event's date as a plain `YYYY-MM-DD` calendar date (clubfindr's
 * `$lib/localDate`, KNOWN_ISSUES 17). `new Date('2031-06-21')` reads that as *UTC* midnight,
 * so anything that then uses the local date parts — a date picker, `toLocaleDateString` — sees
 * the day before on a device west of UTC. These two functions only ever use local parts, so a
 * date read from the API and written back to it survives the round trip unchanged.
 */

/** Local midnight of a `YYYY-MM-DD` date. Falls back to `new Date(value)` for anything else. */
export function fromLocalIsoDate(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return new Date(value);
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
}

/** The local calendar date of `date` as `YYYY-MM-DD`. */
export function toLocalIsoDate(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
