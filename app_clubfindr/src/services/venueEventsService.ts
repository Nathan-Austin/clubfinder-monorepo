/**
 * The venue's own events (`GET /api/mobile/bars/:barId/events`, upcoming ones by date), for the
 * venue side's Events tab and the Overview's "next event" (ROADMAP "Venue side of the app", step 9).
 *
 * The dashboard used to give an event without an id a random one (`event-0.123…`, which then
 * could not be deleted) and one without a date today's date (so it showed as tonight's). Such
 * rows are left out now.
 *
 * Recurring events are one row with their first date: the server does not expand them into
 * dates yet (KNOWN_ISSUES 90), so after that date they are not listed at all.
 */
import axiosClient from '../api/axiosClient';
import { log } from '../utils/logger';

export type VenueEvent = {
    id: string;
    theme_name: string;
    description: string;
    /** YYYY-MM-DD, a local calendar day */
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    recurring: boolean;
    recurrence_pattern: string | null;
    special_genres: string[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

/** One row of the server's answer, or null when it has no id or no usable date. */
export function toVenueEvent(raw: unknown): VenueEvent | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === 'number' ? String(row.id) : text(row.id);
    // The server sends DATE columns as YYYY-MM-DD; take the day from a timestamp just in case
    const date = text(row.event_date)?.slice(0, 10) ?? null;
    if (!id || !date || !ISO_DATE.test(date)) return null;
    return {
        id,
        theme_name: text(row.theme_name) ?? 'Event',
        description: text(row.description) ?? '',
        event_date: date,
        start_time: text(row.start_time),
        end_time: text(row.end_time),
        recurring: row.recurring === true,
        recurrence_pattern: text(row.recurrence_pattern),
        special_genres: Array.isArray(row.special_genres)
            ? row.special_genres.filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
            : [],
    };
}

/** The upcoming events, soonest first. Throws when they could not be loaded. */
export async function listVenueEvents(barId: string): Promise<VenueEvent[]> {
    const response = await axiosClient.get(`/api/mobile/bars/${encodeURIComponent(barId)}/events`);
    const rows = (response.data as { events?: unknown })?.events;
    if (!Array.isArray(rows)) throw new Error('The events could not be read');
    const events = rows.map(toVenueEvent).filter((e): e is VenueEvent => e !== null);
    if (events.length < rows.length) {
        log.warn(`Left out ${rows.length - events.length} event(s) without an id or date`);
    }
    return events.sort(
        (a, b) => a.event_date.localeCompare(b.event_date) || (a.start_time ?? '').localeCompare(b.start_time ?? '')
    );
}

/** The first event on or after `today` (YYYY-MM-DD), or null. */
export function nextVenueEvent(events: readonly VenueEvent[], today: string): VenueEvent | null {
    return events.find((event) => event.event_date >= today) ?? null;
}
