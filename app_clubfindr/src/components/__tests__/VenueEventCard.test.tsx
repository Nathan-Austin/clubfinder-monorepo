import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import VenueEventCard from '../VenueEventCard';
import type { VenueEvent } from '../../services/venueEventsService';

const event: VenueEvent = {
  id: 'ev-1',
  theme_name: 'Friday Session',
  description: 'Deep cuts all night',
  event_date: '2026-12-04',
  start_time: '22:00:00',
  end_time: '04:00:00',
  recurring: true,
  recurrence_pattern: 'weekly',
  special_genres: ['house', 'disco'],
};

it('shows the event and hands it to edit and delete', () => {
  const onEdit = jest.fn();
  const onDelete = jest.fn();
  render(<VenueEventCard event={event} onEdit={onEdit} onDelete={onDelete} />);

  expect(screen.getByText('Friday Session')).toBeTruthy();
  expect(screen.getByText('Friday, December 4, 2026')).toBeTruthy();
  expect(screen.getByText('Weekly')).toBeTruthy();
  expect(screen.getByText('22:00 - 04:00')).toBeTruthy();
  expect(screen.getByText('Deep cuts all night')).toBeTruthy();
  expect(screen.getByText('disco')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('Edit Friday Session'));
  fireEvent.press(screen.getByLabelText('Delete Friday Session'));
  expect(onEdit).toHaveBeenCalledWith(event);
  expect(onDelete).toHaveBeenCalledWith(event);
});

it('takes no second delete while one runs', () => {
  const onDelete = jest.fn();
  render(<VenueEventCard event={event} onEdit={jest.fn()} onDelete={onDelete} disabled />);
  fireEvent.press(screen.getByLabelText('Delete Friday Session'));
  expect(onDelete).not.toHaveBeenCalled();
});
