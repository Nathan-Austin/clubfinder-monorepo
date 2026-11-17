/**
 * The event form's genres come from the shared vocabulary (ROADMAP "Venue side of the app", step
 * 8) instead of a hard-coded list of 18, and an event's existing genres survive an edit, whatever
 * list they came from.
 */
import React from 'react';
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
  special_genres: ['Live Music'],
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
  expect(screen.getByText('Live Music')).toBeTruthy();
  // The old fixed grid is gone: its "Acoustic" button is not on the screen
  expect(screen.queryByText('Acoustic')).toBeNull();

  fireEvent.changeText(screen.getByTestId('event-genre-input'), 'techno');
  fireEvent.press(screen.getAllByTestId('event-genre-suggestion')[0]);
  await waitFor(() => expect(screen.getAllByTestId('event-genre')).toHaveLength(2));

  fireEvent.press(screen.getByText('Update Event'));
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  const [url, body] = put.mock.calls[0];
  expect(url).toBe('/api/mobile/bars/bar-1/events/ev-1');
  expect(body.special_genres[0]).toBe('Live Music');
  expect(body.special_genres).toHaveLength(2);
  expect(body.special_genres[1].toLowerCase()).toContain('techno');
});
