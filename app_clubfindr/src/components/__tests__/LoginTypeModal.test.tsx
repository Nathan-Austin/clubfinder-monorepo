import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LoginTypeModal from '../LoginTypeModal';

const props = { visible: true, isBarLoginMode: false, onSelect: jest.fn(), onClose: jest.fn() };

beforeEach(() => jest.clearAllMocks());

describe('LoginTypeModal', () => {
  it('offers both logins and reports the choice', () => {
    const screen = render(<LoginTypeModal {...props} />);
    fireEvent.press(screen.getByText('Bar Manager Login'));
    expect(props.onSelect).toHaveBeenCalledWith(true);
    fireEvent.press(screen.getByText('Customer Login'));
    expect(props.onSelect).toHaveBeenCalledWith(false);
  });

  it('closes', () => {
    const screen = render(<LoginTypeModal {...props} />);
    fireEvent.press(screen.getByText('Close'));
    expect(props.onClose).toHaveBeenCalled();
  });
});
