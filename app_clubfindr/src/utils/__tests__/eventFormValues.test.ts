import {
  formatTimeToString,
  parseTimeString,
  toEventPayload,
  validateEventForm,
  type EventFormValues,
} from '../eventFormValues';

const at = (hours: number, minutes = 0) => {
  const date = new Date(2026, 11, 4);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const values = (overrides: Partial<EventFormValues> = {}): EventFormValues => ({
  themeName: 'Friday Session',
  description: '',
  eventDate: new Date(2026, 11, 4),
  startTime: at(22),
  endTime: at(23, 30),
  hasStartTime: true,
  hasEndTime: true,
  isRecurring: false,
  recurrencePattern: 'weekly',
  liveMusic: false,
  specialGenres: ['house'],
  ...overrides,
});

describe('times', () => {
  it('reads "HH:MM" and "HH:MM:SS" and writes "HH:MM"', () => {
    expect(formatTimeToString(parseTimeString('22:05:00'))).toBe('22:05');
    expect(formatTimeToString(parseTimeString('07:30'))).toBe('07:30');
  });
});

describe('validateEventForm', () => {
  it('passes a complete event', () => {
    expect(validateEventForm(values())).toEqual({});
  });

  it('wants a name', () => {
    expect(validateEventForm(values({ themeName: '   ' }))).toEqual({ themeName: 'Event theme/name is required' });
  });

  it('wants the end after the start', () => {
    expect(validateEventForm(values({ startTime: at(22), endTime: at(21) }))).toEqual({
      endTime: 'End time must be after start time',
    });
    expect(validateEventForm(values({ startTime: at(22), endTime: at(22) })).endTime).toBeDefined();
  });

  it('takes an end before 06:00 as the next morning', () => {
    expect(validateEventForm(values({ startTime: at(22), endTime: at(4) }))).toEqual({});
    expect(validateEventForm(values({ startTime: at(22), endTime: at(6) })).endTime).toBeDefined();
  });

  it('compares times of day, whatever day the Date objects carry', () => {
    const lateStartYesterday = new Date(2026, 11, 3, 22, 0);
    const endToday = new Date(2026, 11, 4, 23, 0);
    expect(validateEventForm(values({ startTime: lateStartYesterday, endTime: endToday }))).toEqual({});
  });

  it('does not compare when either time is off', () => {
    expect(validateEventForm(values({ startTime: at(22), endTime: at(21), hasEndTime: false }))).toEqual({});
  });
});

describe('toEventPayload', () => {
  it('builds the body the events endpoints take', () => {
    expect(toEventPayload(values({ isRecurring: true, recurrencePattern: 'biweekly' }), 'bar-1')).toEqual({
      bar_id: 'bar-1',
      theme_name: 'Friday Session',
      description: '',
      event_date: '2026-12-04',
      start_time: '22:00',
      end_time: '23:30',
      recurring: true,
      recurrence_pattern: 'biweekly',
      live_music: false,
      special_genres: ['house'],
    });
  });

  // Live music is an attribute of the night, not a genre (ROADMAP section 5)
  it('sends live music as an attribute', () => {
    expect(toEventPayload(values({ liveMusic: true }), 'bar-1')).toMatchObject({ live_music: true });
  });

  it('sends no times that are off, and no pattern for a one-off', () => {
    expect(toEventPayload(values({ hasStartTime: false, hasEndTime: false }), 'bar-1')).toMatchObject({
      start_time: null,
      end_time: null,
      recurring: false,
      recurrence_pattern: null,
    });
  });
});
