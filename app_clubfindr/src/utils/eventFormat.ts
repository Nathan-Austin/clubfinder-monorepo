/**
 * How a venue event's day and times read on the venue screens, as plain functions (the dashboard
 * had them inline).
 */
import { fromLocalIsoDate } from './localDate';

const RECURRENCE_LABELS: Record<string, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Every two weeks',
    monthly: 'Monthly',
};

/** "Friday, December 4, 2026": a YYYY-MM-DD calendar day read as a local day, not UTC midnight */
export function formatEventDate(isoDate: string): string {
    return fromLocalIsoDate(isoDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

/** "22:00 - 04:00", "Starts at 22:00", "Ends at 04:00", or '' when neither is set */
export function formatEventTimes(start: string | null, end: string | null): string {
    const hhmm = (time: string) => time.substring(0, 5);
    if (start && end) return `${hhmm(start)} - ${hhmm(end)}`;
    if (start) return `Starts at ${hhmm(start)}`;
    if (end) return `Ends at ${hhmm(end)}`;
    return '';
}

/** "Weekly" for the form's values; any other stored text as it is */
export function formatRecurrence(pattern: string | null): string {
    if (!pattern) return 'Recurring';
    return RECURRENCE_LABELS[pattern] ?? pattern;
}
