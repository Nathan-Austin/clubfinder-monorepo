/**
 * The venue card's "Today" / "Next Event" wording reads API dates as local calendar days
 * (KNOWN_ISSUES 80: `new Date('YYYY-MM-DD')` is UTC midnight, a day early west of UTC).
 */
import { eventBadgeText, formatEventDate } from '../venueEventDates';

// A Saturday, local time, mid-afternoon
const today = new Date(2031, 5, 21, 15, 30);

describe('formatEventDate', () => {
  it('reads the API date as a local day, whatever the time zone', () => {
    expect(formatEventDate('2031-06-21', today)).toBe('Today');
    expect(formatEventDate('2031-06-21T00:00:00.000Z', today)).toBe('Today');
    expect(formatEventDate('2031-06-22', today)).toBe('Tomorrow');
  });

  it('names the weekday inside the week and the date beyond it', () => {
    expect(formatEventDate('2031-06-25', today)).toBe('Wednesday');
    expect(formatEventDate('2031-06-27', today)).toBe('Friday');
    expect(formatEventDate('2031-06-28', today)).toBe('Jun 28');
    expect(formatEventDate('2031-12-04', today)).toBe('Dec 4');
  });

  it('says Date TBA for nothing or nonsense', () => {
    expect(formatEventDate('', today)).toBe('Date TBA');
    expect(formatEventDate('soon', today)).toBe('Date TBA');
  });
});

describe('eventBadgeText', () => {
  it('counts tonight first', () => {
    expect(eventBadgeText([{ event_date: '2031-06-21' }, { event_date: '2031-06-21' }, { event_date: '2031-06-22' }], today)).toBe(
      '2 Events Today'
    );
    expect(eventBadgeText([{ event_date: '2031-06-21' }], today)).toBe('1 Event Today');
  });

  it('else names the next date, whatever order the events came in', () => {
    expect(eventBadgeText([{ event_date: '2031-07-01' }, { event_date: '2031-06-22' }], today)).toBe('Next Event: Tomorrow');
    expect(eventBadgeText([{ event_date: '2031-07-01' }, { event_date: '2031-06-25' }], today)).toBe('Next Event: Wednesday');
  });

  it('treats a missing date as today and says nothing without events', () => {
    expect(eventBadgeText([{ event_date: null }], today)).toBe('1 Event Today');
    expect(eventBadgeText([], today)).toBe('');
    expect(eventBadgeText(undefined, today)).toBe('');
  });
});
