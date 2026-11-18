import React from 'react';
import { render, screen, act } from '@testing-library/react-native';

// The banner must hide again after coming back online. The listener is registered once, and
// the old code compared against the first render's isVisible inside its closure, so the banner
// appeared on going offline and then stayed (as a green "WiFi" strip) for ever
// (DEVICE_CHECKLIST 2026-11-18; the logic dated from January).

type Listener = (state: { isConnected: boolean | null; type: string }) => void;
let listener: Listener;

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((cb: Listener) => {
      listener = cb;
      return () => {};
    }),
    fetch: jest.fn(() => new Promise(() => {})) // initial state arrives via the listener
  }
}));

import NetworkStatus from '../NetworkStatus';

const goOffline = () => act(() => listener({ isConnected: false, type: 'none' }));
const goOnline = (type = 'wifi') => act(() => listener({ isConnected: true, type }));

describe('NetworkStatus', () => {
  it('shows nothing while the connection is fine', () => {
    render(<NetworkStatus />);
    goOnline();
    expect(screen.queryByText('Offline')).toBeNull();
    expect(screen.queryByText('WiFi')).toBeNull();
  });

  it('shows the banner offline and hides it again when the connection returns', () => {
    render(<NetworkStatus />);
    goOffline();
    expect(screen.getByText('Offline')).toBeTruthy();

    goOnline();
    expect(screen.queryByText('Offline')).toBeNull();
    expect(screen.queryByText('WiFi')).toBeNull();

    // And it still works the next time round
    goOffline();
    expect(screen.getByText('Offline')).toBeTruthy();
  });

  it('does not alarm before the first state is known', () => {
    render(<NetworkStatus />);
    expect(screen.queryByText('Offline')).toBeNull();
  });
});
