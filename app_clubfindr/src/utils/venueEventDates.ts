/**
 * What a venue card says about its events' dates ("Today", "Tomorrow", "Friday", "Dec 4",
 * "2 Events Today", "Next Event: Tomorrow"), as plain functions over calendar dates.
 *
 * The API sends `YYYY-MM-DD`; until 2026-11-19 the card read it with `new Date(...)`, which is
 * UTC midnight, so west of UTC an event showed a day early (KNOWN_ISSUES 80). Everything here
 * goes through `localDate`, which only uses local parts.
 */
import { fromLocalIsoDate, toLocalIsoDate } from './localDate';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` from the API, with or without a time part; invalid input gives null. */
function calendarDate(dateStr: string): Date | null {
    const [datePart] = dateStr.split('T');
    const date = fromLocalIsoDate(datePart);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** Local midnight of `date`. */
function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatEventDate(dateStr: string, today: Date = new Date()): string {
    const date = dateStr ? calendarDate(dateStr) : null;
    if (!date) return 'Date TBA';
    const todayStart = startOfDay(today);
    const dayDifference = Math.round((date.getTime() - todayStart.getTime()) / DAY_MS);
    if (dayDifference === 0) return 'Today';
    if (dayDifference === 1) return 'Tomorrow';
    if (dayDifference > 1 && dayDifference < 7) {
        return date.toLocaleDateString('en-US', { weekday: 'long' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "2 Events Today", "Next Event: Friday", or '' without events. Dates missing count as today. */
export function eventBadgeText(
    events: readonly { event_date?: string | null }[] | undefined,
    today: Date = new Date()
): string {
    if (!events || events.length === 0) return '';
    const todayIso = toLocalIsoDate(today);
    const dateOf = (event: { event_date?: string | null }) => (event.event_date || todayIso).split('T')[0];

    const todayCount = events.filter((event) => dateOf(event) === todayIso).length;
    if (todayCount > 0) return `${todayCount} Event${todayCount > 1 ? 's' : ''} Today`;

    // YYYY-MM-DD sorts as text
    const next = [...events].map(dateOf).sort()[0];
    return `Next Event: ${formatEventDate(next, today)}`;
}
