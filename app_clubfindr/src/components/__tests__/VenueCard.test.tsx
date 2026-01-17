import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import VenueCard from '../VenueCard';

describe('VenueCard Component', () => {
  const mockVenue = {
    id: '123',
    name: 'Test Venue',
    address: '123 Test St, London',
    genres: ['House', 'Techno', 'Electronic'],
    currentTrack: {
      name: 'Test Track',
      artist: 'Test Artist'
    },
    similarity: 0.85
  };

  const mockOnPress = jest.fn();

  it('renders correctly with all props', () => {
    const { getByText } = render(
      <VenueCard venue={mockVenue} onPress={mockOnPress} />
    );

    expect(getByText('Test Venue')).toBeTruthy();
    expect(getByText('123 Test St, London')).toBeTruthy();
    expect(getByText('85% Match')).toBeTruthy();
    expect(getByText('Test Track')).toBeTruthy();
    expect(getByText('Test Artist')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const { getByText } = render(
      <VenueCard venue={mockVenue} onPress={mockOnPress} />
    );

    fireEvent.press(getByText('Test Venue'));
    expect(mockOnPress).toHaveBeenCalledWith(mockVenue);
  });
});
