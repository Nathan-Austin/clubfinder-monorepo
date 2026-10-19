import { test, expect, chooseCityAndGenre, login } from './fixtures';

/**
 * KNOWN_ISSUES #1: the search forms serialise the picked date with
 * `toISOString().substring(0, 10)`, which is the UTC date, not the user's calendar date.
 *
 * Each case runs the browser in a time zone on the far side of midnight from UTC with the
 * clock pinned to a wall-clock time where the two dates differ:
 *
 * - Pacific/Auckland (UTC+12/+13) at 00:30: the local day has started, UTC is still on the
 *   previous day, so the search goes out for yesterday.
 * - America/Los_Angeles (UTC-7/-8) at 20:00: UTC is already on the next day, so the search
 *   goes out for tomorrow.
 *
 * What the user picked is the local calendar date; that is what must reach the server and
 * what /clubs must report back in its heading.
 */

const cases = [
	{ zone: 'Pacific/Auckland', hour: 0, minute: 30 }, // UTC+12/+13: UTC is still yesterday
	{ zone: 'America/Los_Angeles', hour: 20, minute: 0 } // UTC-7/-8: UTC is already tomorrow
] as const;

type Ymd = { y: number; m: number; d: number };

/** The calendar date to search for: tomorrow (UTC), safely inside the seed's -3..+21 days. */
function pickedDate(): Ymd {
	const t = new Date(Date.now() + 24 * 60 * 60 * 1000);
	return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function iso({ y, m, d }: Ymd) {
	return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Same format as the /clubs heading: "Friday, October 17" (date parts only, no zone). */
function long({ y, m, d }: Ymd) {
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(Date.UTC(y, m - 1, d));
}

/** Offset of `zone` from UTC at `epochMs`, in milliseconds. */
function zoneOffsetMs(zone: string, epochMs: number) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(new Date(epochMs));
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	const wall = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second')
	);
	return wall - Math.floor(epochMs / 1000) * 1000;
}

/** The instant at which a clock in `zone` shows the given local date and time. */
function instantAt(zone: string, { y, m, d }: Ymd, hour: number, minute: number): Date {
	const wall = Date.UTC(y, m - 1, d, hour, minute);
	let instant = wall - zoneOffsetMs(zone, wall);
	// Second pass in case the offset changed between the guess and the result (DST edge)
	instant = wall - zoneOffsetMs(zone, instant);
	return new Date(instant);
}

/** Parses the `{ key, state }` body the pages post to /storestate. */
function postedState(postData: string | null) {
	return JSON.parse(JSON.parse(postData ?? '{}').state) as Record<string, string>;
}

for (const c of cases) {
	test.describe(`search date in ${c.zone}`, () => {
		test.use({ timezoneId: c.zone });

		const wallClock = `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;

		test(`home page search at ${wallClock} local sends and shows the local date`, async ({
			page,
			context,
			pageErrors
		}) => {
			const picked = pickedDate();
			const now = instantAt(c.zone, picked, c.hour, c.minute);
			// Sanity check on the scenario itself: UTC must be on a different calendar day
			expect(now.toISOString().substring(0, 10)).not.toBe(iso(picked));
			await page.clock.setFixedTime(now);

			const storeState = page.waitForRequest(
				(r) => r.method() === 'POST' && new URL(r.url()).pathname === '/storestate'
			);
			// Logged out there is no date picker: the search is for "today", the local date
			const menu = await chooseCityAndGenre(page, 'Berlin', 'Minimal and Techno');
			await menu.locator('button.submit-selection-button', { hasText: 'Find A club' }).click();

			const state = postedState((await storeState).postData());
			expect.soft(state.formattedDate, 'formattedDate posted to /storestate').toBe(iso(picked));

			await page.waitForURL('**/clubs');
			const dateCookie = (await context.cookies()).find((k) => k.name === 'date');
			expect.soft(dateCookie?.value, 'date cookie the server searches by').toBe(iso(picked));
			// /clubs parses the cookie with `new Date('YYYY-MM-DD')` (UTC midnight) and formats it
			// in the local zone: west of UTC that shifts the display back a day, which today
			// happens to cancel the date that was sent a day ahead. Fixing only the sending side
			// would surface it, so the heading is checked too.
			await expect(page.locator('.header')).toContainText(`for ${long(picked)}`);
			expect(pageErrors).toEqual([]);
		});

		test('users-home connect button posts the local date', async ({ page }) => {
			await login(page, 'listener');
			const picked = pickedDate();
			await page.clock.setFixedTime(instantAt(c.zone, picked, c.hour, c.minute));
			await page.goto('/users-home');

			const storeState = page.waitForRequest(
				(r) => r.method() === 'POST' && new URL(r.url()).pathname === '/storestate'
			);
			// Posts the search state, then leaves for SoundCloud (blocked offline, not asserted)
			await page.locator('button.soundcloud-button').click();
			const state = postedState((await storeState).postData());
			expect(state.formattedDate, 'formattedDate posted to /storestate').toBe(iso(picked));
		});
	});
}
