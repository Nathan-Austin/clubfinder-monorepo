/**
 * The venue side's Overview tab: the next event and the check-in code, leading to the Events tab
 * and the QR codes (ROADMAP "Venue side of the app", step 9).
 */
import React from 'react';
import { Text } from 'react-native';
import 'react-native-gesture-handler/jestSetup';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../contexts/VenueContext', () => ({
  useVenue: () => ({ barId: 'bar-1', barName: 'Club Tilki', setBarName: jest.fn() }),
}));
let mockEvents: unknown[] = [];
jest.mock('../../api/axiosClient', () => ({
  __esModule: true,
  default: {
    get: (url: string) =>
      Promise.resolve({
        data: url.endsWith('/events')
          ? { events: mockEvents }
          : url.endsWith('/stats')
            ? { success: true, stats: { visitorsToday: 12, visitorsWeek: 80, weekOverWeekChange: 5 } }
            : { success: true, bars: [] },
      }),
  },
}));

import BarHomeScreen from '../BarHomeScreen';

const Stack = createStackNavigator();
const Stub = ({ name }: { name: string }) => <Text>{`screen:${name}`}</Text>;

function renderOverview() {
  return render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Overview" component={BarHomeScreen} />
        <Stack.Screen name="Events">{() => <Stub name="Events" />}</Stack.Screen>
        <Stack.Screen name="AddEvent">{() => <Stub name="AddEvent" />}</Stack.Screen>
        <Stack.Screen name="QRCodeGenerator">{() => <Stub name="QRCodeGenerator" />}</Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

beforeEach(() => {
  mockEvents = [];
});

it("shows the venue's name and its visitors", async () => {
  renderOverview();
  expect(await screen.findByText('Club Tilki')).toBeTruthy();
  expect(await screen.findByText('12')).toBeTruthy();
  // The always-0 "Genre Matches" tile stays gone
  expect(screen.queryByText('Genre Matches')).toBeNull();
});

it('shows the next event and leads to the Events tab', async () => {
  mockEvents = [
    { id: 'later', theme_name: 'Later Night', event_date: '2099-12-11' },
    { id: 'next', theme_name: 'Friday Session', event_date: '2099-12-04', start_time: '22:00:00' },
  ];
  renderOverview();
  expect(await screen.findByText('Friday Session')).toBeTruthy();
  expect(screen.queryByText('Later Night')).toBeNull();
  fireEvent.press(screen.getByTestId('overview-next-event'));
  expect(await screen.findByText('screen:Events')).toBeTruthy();
});

it('with nothing planned, leads to Create Event', async () => {
  renderOverview();
  expect(await screen.findByText('Nothing planned yet. Tap to add an event.')).toBeTruthy();
  fireEvent.press(screen.getByTestId('overview-next-event'));
  expect(await screen.findByText('screen:AddEvent')).toBeTruthy();
});

it('leads to the check-in codes', async () => {
  renderOverview();
  fireEvent.press(await screen.findByTestId('overview-checkin-code'));
  expect(await screen.findByText('screen:QRCodeGenerator')).toBeTruthy();
});
