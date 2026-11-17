/**
 * The venue event form's rules and request body, as plain functions (ROADMAP "Venue side of the
 * app", step 9: the form split into sections). They were inline in EventFormScreen.
 */
import { toLocalIsoDate } from './localDate';

export type EventFormValues = {
    themeName: string;
    description: string;
    eventDate: Date;
    startTime: Date;
    endTime: Date;
    hasStartTime: boolean;
    hasEndTime: boolean;
    isRecurring: boolean;
    recurrencePattern: string;
    specialGenres: string[];
};

export type EventFormErrors = { themeName?: string; endTime?: string };

/** The recurrence patterns the form offers */
export const RECURRENCE_PATTERNS: { value: string; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Bi-weekly' },
    { value: 'monthly', label: 'Monthly' },
];

/** An end before this hour is the next morning, so it may be earlier than the start */
export const NEXT_MORNING_BEFORE_HOUR = 6;

/** "22:30" or "22:30:00" as a Date today at that time */
export function parseTimeString(time: string, today: Date = new Date()): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date(today);
    date.setHours(hours || 0, minutes || 0, 0, 0);
    return date;
}

/** A Date's local time as "HH:MM" */
export function formatTimeToString(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const minutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

/** The form's errors; empty when it can be saved */
export function validateEventForm(values: EventFormValues): EventFormErrors {
    const errors: EventFormErrors = {};
    if (!values.themeName.trim()) {
        errors.themeName = 'Event theme/name is required';
    }
    if (values.hasStartTime && values.hasEndTime) {
        const nextMorning = values.endTime.getHours() < NEXT_MORNING_BEFORE_HOUR;
        if (!nextMorning && minutesOfDay(values.endTime) <= minutesOfDay(values.startTime)) {
            errors.endTime = 'End time must be after start time';
        }
    }
    return errors;
}

/** The body for POST /api/mobile/bars/:barId/events and PUT …/events/:eventId */
export function toEventPayload(values: EventFormValues, barId: string) {
    return {
        bar_id: barId,
        theme_name: values.themeName,
        description: values.description || '',
        event_date: toLocalIsoDate(values.eventDate),
        start_time: values.hasStartTime ? formatTimeToString(values.startTime) : null,
        end_time: values.hasEndTime ? formatTimeToString(values.endTime) : null,
        recurring: values.isRecurring,
        recurrence_pattern: values.isRecurring ? values.recurrencePattern : null,
        special_genres: values.specialGenres,
    };
}
