/**
 * The event form's genres come from the shared vocabulary (ROADMAP "Venue side of the app", step
 * 8) instead of a hard-coded list of 18, and an event's existing genres survive an edit, whatever
 * list they came from.
 */
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockEvent = {
  id: 'ev-1',
  theme_name: 'Friday Session',
  description: '',
  event_date: '2026-12-04',
  start_time: null,
  end_time: null,
  recurring: false,
  recurrence_pattern: null,
  special_genres: ['Deep House'],
};

jest.mock('@react-navigation/native', () => ({
  // theme.ts builds the app's theme from it
  DarkTheme: jest.requireActual('@react-navigation/native').DarkTheme,
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() }),
  useRoute: () => ({ name: 'EditEvent', params: { event: mockEvent } }),
}));
jest.mock('../../contexts/VenueContext', () => ({
  useVenue: () => ({ barId: 'bar-1', barName: 'Club Tilki', setBarName: jest.fn() }),
}));
jest.mock('../../api/axiosClient', () => ({
  __esModule: true,
  default: { put: jest.fn().mockResolvedValue({ data: { success: true } }), post: jest.fn() },
}));
jest.mock('react-native-paper-dates', () => ({
  DatePickerModal: () => null,
  TimePickerModal: () => null,
  enGB: {},
  registerTranslation: jest.fn(),
}));

import axiosClient from '../../api/axiosClient';
import EventFormScreen from '../EventFormScreen';

const put = axiosClient.put as jest.Mock;

it("keeps an event's existing genres and saves the ones added from the shared list", async () => {
  render(<EventFormScreen />);
  expect(screen.getByText('Deep House')).toBeTruthy();
  // The old fixed grid is gone: its "Acoustic" button is not on the screen
  expect(screen.queryByText('Acoustic')).toBeNull();

  fireEvent.changeText(screen.getByTestId('event-genre-input'), 'techno');
  fireEvent.press(screen.getAllByTestId('event-genre-suggestion')[0]);
  await waitFor(() => expect(screen.getAllByTestId('event-genre')).toHaveLength(2));

  fireEvent.press(screen.getByText('Update Event'));
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  const [url, body] = put.mock.calls[0];
  expect(url).toBe('/api/mobile/bars/bar-1/events/ev-1');
  expect(body.special_genres[0]).toBe('Deep House');
  expect(body.special_genres).toHaveLength(2);
  expect(body.special_genres[1].toLowerCase()).toContain('techno');
});

// The form split into sections (step 9) keeps its rules and its request body
it('refuses to save without a name, and saves a recurring event with its pattern', async () => {
  put.mockClear();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  render(<EventFormScreen />);

  fireEvent.changeText(screen.getByPlaceholderText('e.g., Jazz Night, Salsa Tuesday'), '  ');
  fireEvent.press(screen.getByText('Update Event'));
  expect(await screen.findByText('Event theme/name is required')).toBeTruthy();
  expect(put).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByPlaceholderText('e.g., Jazz Night, Salsa Tuesday'), 'Friday Session');
  fireEvent(screen.getByTestId('event-recurring-switch'), 'valueChange', true);
  // The server expands a series into its dates now (KNOWN_ISSUES 90)
  expect(await screen.findByText('Every date is listed and matched, for the next two months.')).toBeTruthy();
  fireEvent.press(screen.getByText('Update Event'));

  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  expect(put.mock.calls[0][1]).toMatchObject({
    theme_name: 'Friday Session',
    event_date: '2026-12-04',
    recurring: true,
    recurrence_pattern: 'weekly',
    start_time: null,
    end_time: null,
  });
  alert.mockRestore();
});

// A genre outside the one genre list is shown in amber with the reason, and the save waits
// until it is removed (DEVICE_CHECKLIST 2026-11-19, section 6; owner's decision: inline, not a
// refusal after Save)
it('marks a genre the server would refuse and holds the save until it is removed', async () => {
  put.mockClear();
  render(<EventFormScreen />);

  fireEvent.changeText(screen.getByTestId('event-genre-input'), 'polka-step');
  // Nothing in the list is called that: the field says so before anything is added
  expect(screen.getByTestId('event-genre-typed-unknown')).toBeTruthy();
  fireEvent.press(screen.getByTestId('event-genre-add'));

  const unknownChip = await screen.findByTestId('event-genre-unknown');
  expect(unknownChip).toBeTruthy();
  expect(screen.getByTestId('event-genres-unknown-note').props.children).toContain(
    '"polka-step" is not a genre Clubfindr knows'
  );
  expect(screen.getByTestId('event-submit').props.accessibilityState?.disabled).toBe(true);
  fireEvent.press(screen.getByText('Update Event'));
  expect(put).not.toHaveBeenCalled();

  fireEvent.press(screen.getByLabelText('Remove polka-step'));
  await waitFor(() => expect(screen.queryByTestId('event-genre-unknown')).toBeNull());
  expect(screen.getByTestId('event-submit').props.accessibilityState?.disabled).toBe(false);
  fireEvent.press(screen.getByText('Update Event'));
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  expect(put.mock.calls[0][1].special_genres).toEqual(['Deep House']);
});
