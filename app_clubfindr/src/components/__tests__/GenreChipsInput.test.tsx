/**
 * The shared genre chips and field: the venue's "Genres you play" and the event form use it.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import GenreChipsInput from '../GenreChipsInput';

function setup(props: Partial<React.ComponentProps<typeof GenreChipsInput>> = {}) {
  const onAdd = jest.fn().mockReturnValue(true);
  const onRemove = jest.fn();
  render(<GenreChipsInput genres={['house']} onAdd={onAdd} onRemove={onRemove} {...props} />);
  return { onAdd, onRemove };
}

it('suggests from the shared vocabulary and adds the one picked', async () => {
  const { onAdd } = setup();
  fireEvent.changeText(screen.getByTestId('genre-input'), 'techno');
  const suggestions = screen.getAllByTestId('genre-suggestion');
  expect(suggestions.length).toBeGreaterThan(0);
  fireEvent.press(suggestions[0]);
  await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
  expect(onAdd.mock.calls[0][0].toLowerCase()).toContain('techno');
});

it('adds any typed text and clears the field when it was taken', async () => {
  const { onAdd } = setup();
  fireEvent.changeText(screen.getByTestId('genre-input'), '  Live Music ');
  fireEvent.press(screen.getByTestId('genre-add'));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Live Music'));
  await waitFor(() => expect(screen.getByTestId('genre-input').props.value).toBe(''));
});

it('keeps the text when the add was refused', async () => {
  const { onAdd } = setup({ onAdd: jest.fn().mockResolvedValue(false) });
  fireEvent.changeText(screen.getByTestId('genre-input'), 'polka-step');
  fireEvent.press(screen.getByTestId('genre-add'));
  await waitFor(() => expect(screen.getByTestId('genre-input').props.value).toBe('polka-step'));
  expect(onAdd).not.toHaveBeenCalledWith('house');
});

it('does not add a genre already chosen, in any case or spacing', () => {
  const { onAdd } = setup();
  fireEvent.changeText(screen.getByTestId('genre-input'), '  HOUSE ');
  fireEvent.press(screen.getByTestId('genre-add'));
  expect(onAdd).not.toHaveBeenCalled();
});

it('removes a chip', () => {
  const { onRemove } = setup();
  fireEvent.press(screen.getByLabelText('Remove house'));
  expect(onRemove).toHaveBeenCalledWith('house');
});

it('takes nothing more at the limit, and says how many', () => {
  const { onAdd } = setup({ genres: ['a', 'b'], max: 2 });
  expect(screen.getByText('2 of 2')).toBeTruthy();
  expect(screen.getByTestId('genre-input').props.editable).toBe(false);
  fireEvent.press(screen.getByTestId('genre-add'));
  expect(onAdd).not.toHaveBeenCalled();
});

it('takes no changes while a save is in flight', () => {
  const { onAdd } = setup({ busy: true });
  fireEvent.changeText(screen.getByTestId('genre-input'), 'soul');
  fireEvent.press(screen.getByTestId('genre-add'));
  expect(onAdd).not.toHaveBeenCalled();
});

it('shows a genre outside the shared list in amber, with the reason', () => {
  setup({ genres: ['house', 'polka-step'] });
  expect(screen.getAllByTestId('genre')).toHaveLength(1);
  expect(screen.getByTestId('genre-unknown')).toBeTruthy();
  expect(screen.getByText('polka-step ?')).toBeTruthy();
  expect(screen.getByTestId('genres-unknown-note').props.children).toContain('"polka-step"');
});

it('names every unknown genre when there are several', () => {
  setup({ genres: ['polka-step', 'techno', 'zorbcore'] });
  expect(screen.getAllByTestId('genre-unknown')).toHaveLength(2);
  expect(screen.getByTestId('genres-unknown-note').props.children).toContain('polka-step, zorbcore');
});
