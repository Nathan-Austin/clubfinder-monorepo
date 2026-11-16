import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LoadError from '../LoadError';

describe('LoadError', () => {
  it('says what failed and retries on press', () => {
    const onRetry = jest.fn();
    const screen = render(<LoadError onRetry={onRetry} />);
    expect(screen.getByText("We couldn't load venues just now.")).toBeTruthy();
    fireEvent.press(screen.getByTestId('load-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('cannot be pressed again while retrying', () => {
    const onRetry = jest.fn();
    const screen = render(<LoadError onRetry={onRetry} retrying />);
    fireEvent.press(screen.getByTestId('load-error-retry'));
    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.getByText('Trying again…')).toBeTruthy();
  });
});
