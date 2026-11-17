import { formatEventDate, formatEventTimes, formatRecurrence } from '../eventFormat';

describe('formatEventDate', () => {
  it('reads the calendar day as a local day', () => {
    expect(formatEventDate('2026-12-04')).toBe('Friday, December 4, 2026');
  });
});

describe('formatEventTimes', () => {
  it.each([
    ['22:00:00', '04:00:00', '22:00 - 04:00'],
    ['22:00:00', null, 'Starts at 22:00'],
    [null, '04:00', 'Ends at 04:00'],
    [null, null, ''],
  ])('%s to %s reads "%s"', (start, end, expected) => {
    expect(formatEventTimes(start, end)).toBe(expected);
  });
});

describe('formatRecurrence', () => {
  it('names the form\'s patterns', () => {
    expect(formatRecurrence('weekly')).toBe('Weekly');
    expect(formatRecurrence('biweekly')).toBe('Every two weeks');
  });

  it('shows other stored text as it is, and no pattern as "Recurring"', () => {
    expect(formatRecurrence('every full moon')).toBe('every full moon');
    expect(formatRecurrence(null)).toBe('Recurring');
  });
});
