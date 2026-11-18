jest.mock('../../api/axiosClient', () => ({ __esModule: true, default: { get: jest.fn() } }));

import axiosClient from '../../api/axiosClient';
import { listVenueEvents, nextVenueEvent, toVenueEvent, type VenueEvent } from '../venueEventsService';

const get = axiosClient.get as jest.Mock;

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'ev-1',
  theme_name: 'Friday Session',
  description: 'Deep cuts',
  event_date: '2026-12-04',
  start_time: '22:00:00',
  end_time: '04:00:00',
  recurring: true,
  recurrence_pattern: 'weekly',
  special_genres: ['house', '', 3],
  ...overrides,
});

describe('toVenueEvent', () => {
  it('reads a server row, dropping blank and non-text genres', () => {
    expect(toVenueEvent(row())).toEqual({
      id: 'ev-1',
      occurrence_id: 'ev-1:2026-12-04',
      theme_name: 'Friday Session',
      description: 'Deep cuts',
      event_date: '2026-12-04',
      start_time: '22:00:00',
      end_time: '04:00:00',
      recurring: true,
      recurrence_pattern: 'weekly',
      special_genres: ['house'],
    });
  });

  // One series arrives once per date since the server expands it (KNOWN_ISSUES 90); the
  // occurrence id tells those entries apart, and a server that does not send one is fine
  it('keeps the occurrence id the server sends', () => {
    expect(toVenueEvent(row({ occurrence_id: 'ev-1:2026-12-11', event_date: '2026-12-11' }))).toMatchObject({
      id: 'ev-1',
      occurrence_id: 'ev-1:2026-12-11',
    });
  });

  // The dashboard gave such rows a random id (undeletable) or today's date (shown as tonight's)
  it.each([
    ['no id', { id: undefined }],
    ['an empty id', { id: '  ' }],
    ['no date', { event_date: null }],
    ['a date that is not a day', { event_date: 'next friday' }],
  ])('leaves out a row with %s', (_label, overrides) => {
    expect(toVenueEvent(row(overrides))).toBeNull();
  });

  it('takes the day from a timestamp and a numeric id', () => {
    expect(toVenueEvent(row({ id: 7, event_date: '2026-12-04T00:00:00.000Z' }))).toMatchObject({
      id: '7',
      event_date: '2026-12-04',
    });
  });

  it('fills what is optional', () => {
    expect(
      toVenueEvent({ id: 'e', event_date: '2026-12-04' })
    ).toEqual({
      id: 'e',
      occurrence_id: 'e:2026-12-04',
      theme_name: 'Event',
      description: '',
      event_date: '2026-12-04',
      start_time: null,
      end_time: null,
      recurring: false,
      recurrence_pattern: null,
      special_genres: [],
    });
  });
});

describe('listVenueEvents', () => {
  beforeEach(() => get.mockReset());

  it('loads, leaves out bad rows and sorts soonest first', async () => {
    get.mockResolvedValue({
      data: {
        events: [
          row({ id: 'late', event_date: '2026-12-10' }),
          row({ id: 'bad', event_date: null }),
          row({ id: 'early-night', event_date: '2026-12-04', start_time: '23:00:00' }),
          row({ id: 'early-evening', event_date: '2026-12-04', start_time: '19:00:00' }),
        ],
      },
    });
    const events = await listVenueEvents('bar-1');
    expect(get).toHaveBeenCalledWith('/api/mobile/bars/bar-1/events');
    expect(events.map((e) => e.id)).toEqual(['early-evening', 'early-night', 'late']);
  });

  it('throws on an answer without a list, rather than showing "no events"', async () => {
    get.mockResolvedValue({ data: { error: 'nope' } });
    await expect(listVenueEvents('bar-1')).rejects.toThrow();
  });
});

describe('nextVenueEvent', () => {
  const events = [{ event_date: '2026-11-16' }, { event_date: '2026-11-17' }, { event_date: '2026-12-01' }] as VenueEvent[];

  it('is today\'s event when there is one', () => {
    expect(nextVenueEvent(events, '2026-11-17')?.event_date).toBe('2026-11-17');
  });

  it('is the next one after today otherwise', () => {
    expect(nextVenueEvent(events, '2026-11-18')?.event_date).toBe('2026-12-01');
  });

  it('is null when nothing is coming', () => {
    expect(nextVenueEvent(events, '2026-12-02')).toBeNull();
  });
});
