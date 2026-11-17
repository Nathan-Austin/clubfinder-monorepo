/**
 * "Genres you play" on the venue's Music tab, against `GET`/`PUT /api/venues/:barId/taste/genres`.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('../../api/axiosClient', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn() } }));

import axiosClient from '../../api/axiosClient';
import VenueGenresEditor from '../VenueGenresEditor';

const get = axiosClient.get as jest.Mock;
const put = axiosClient.put as jest.Mock;
const BAR = '3f2a9c1e-8b4d-4e6f-9a1b-2c3d4e5f6a7b';
const URL = `/api/venues/${BAR}/taste/genres`;

beforeEach(() => {
  get.mockReset();
  put.mockReset();
});

it("loads the venue's genres", async () => {
  get.mockResolvedValue({ data: { genres: ['house', 'techno'] } });
  render(<VenueGenresEditor barId={BAR} />);
  expect(await screen.findByText('house')).toBeTruthy();
  expect(screen.getByText('techno')).toBeTruthy();
  expect(screen.getByText('2 of 15')).toBeTruthy();
  expect(get).toHaveBeenCalledWith(URL);
});

it('says when there are none yet', async () => {
  get.mockResolvedValue({ data: { genres: [] } });
  render(<VenueGenresEditor barId={BAR} />);
  expect(await screen.findByTestId('venue-genres-empty')).toBeTruthy();
});

it('adds a suggested genre and shows what the server stored', async () => {
  get.mockResolvedValue({ data: { genres: ['house'] } });
  put.mockResolvedValue({ data: { genres: ['house', 'techno'] } });
  render(<VenueGenresEditor barId={BAR} />);
  await screen.findByText('house');

  fireEvent.changeText(screen.getByTestId('venue-genre-input'), 'techn');
  const suggestion = screen.getAllByTestId('venue-genre-suggestion')[0];
  fireEvent.press(suggestion);

  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  const [url, body] = put.mock.calls[0];
  expect(url).toBe(URL);
  expect(body.genres[0]).toBe('house');
  expect(body.genres).toHaveLength(2);
  expect(await screen.findByText('techno')).toBeTruthy();
});

it('adds typed text with the Add button, and does not add a genre twice', async () => {
  get.mockResolvedValue({ data: { genres: ['techno'] } });
  put.mockResolvedValue({ data: { genres: ['soul', 'techno'] } });
  render(<VenueGenresEditor barId={BAR} />);
  await screen.findByText('techno');

  fireEvent.changeText(screen.getByTestId('venue-genre-input'), '  TECHNO ');
  fireEvent.press(screen.getByTestId('venue-genre-add'));
  expect(put).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByTestId('venue-genre-input'), 'soul');
  fireEvent.press(screen.getByTestId('venue-genre-add'));
  await waitFor(() => expect(put).toHaveBeenCalledWith(URL, { genres: ['techno', 'soul'] }));
});

it("shows the server's refusal and keeps the list as it was", async () => {
  get.mockResolvedValue({ data: { genres: ['house'] } });
  put.mockRejectedValue({
    response: { status: 400, data: { message: 'Not genres Clubfindr knows: polka-step', genres: ['polka-step'] } },
  });
  render(<VenueGenresEditor barId={BAR} />);
  await screen.findByText('house');

  fireEvent.changeText(screen.getByTestId('venue-genre-input'), 'polka-step');
  fireEvent.press(screen.getByTestId('venue-genre-add'));

  expect(await screen.findByText('Not genres Clubfindr knows: polka-step')).toBeTruthy();
  expect(screen.getAllByTestId('venue-genre')).toHaveLength(1);
});

it('says the session has ended on a 403', async () => {
  get.mockResolvedValue({ data: { genres: ['house'] } });
  put.mockRejectedValue({ response: { status: 403, data: { message: 'Not logged in as this venue' } } });
  render(<VenueGenresEditor barId={BAR} />);
  await screen.findByText('house');
  fireEvent.press(screen.getByLabelText('Remove house'));
  expect(await screen.findByText('Your venue session has ended. Please log in again.')).toBeTruthy();
});

it('removes a genre', async () => {
  get.mockResolvedValue({ data: { genres: ['house', 'techno'] } });
  put.mockResolvedValue({ data: { genres: ['techno'] } });
  render(<VenueGenresEditor barId={BAR} />);
  await screen.findByText('house');
  fireEvent.press(screen.getByLabelText('Remove house'));
  await waitFor(() => expect(put).toHaveBeenCalledWith(URL, { genres: ['techno'] }));
  await waitFor(() => expect(screen.queryByText('house')).toBeNull());
});

it('stops at 15 genres, as the server does', async () => {
  const fifteen = Array.from({ length: 15 }, (_, i) => `genre ${i}`);
  get.mockResolvedValue({ data: { genres: fifteen } });
  render(<VenueGenresEditor barId={BAR} />);
  await screen.findByText('genre 0');
  expect(screen.getByText('15 of 15')).toBeTruthy();
  expect(screen.getByTestId('venue-genre-input').props.editable).toBe(false);
  fireEvent.press(screen.getByTestId('venue-genre-add'));
  expect(put).not.toHaveBeenCalled();
});

it('offers Try again when the genres could not be loaded', async () => {
  get.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValueOnce({ data: { genres: ['soul'] } });
  render(<VenueGenresEditor barId={BAR} />);
  fireEvent.press(await screen.findByTestId('venue-genres-retry'));
  expect(await screen.findByText('soul')).toBeTruthy();
  expect(screen.queryByTestId('venue-genres-retry')).toBeNull();
});
