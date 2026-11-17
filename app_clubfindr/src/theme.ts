/**
 * The app's one dark theme: the palette the screens are drawn in, and the React Navigation theme
 * built from it, so headers, tab bars, cards and screens agree.
 *
 * `NavigationContainer` had no theme, so React Navigation's light default sat behind every screen
 * that did not paint its own background, which put the QR code screen's white text on light grey
 * (KNOWN_ISSUES 85). The venue bottom tabs (86) share the customer tabs' options from here.
 *
 * New code takes its colours from `colors` rather than writing literals (most of the app's lint
 * warnings are `react-native/no-color-literals`, KNOWN_ISSUES 80).
 */
import { DarkTheme, type Theme } from '@react-navigation/native';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

export const colors = {
  /** Screens */
  background: '#121212',
  /** Sections on a screen */
  surface: '#1E1E1E',
  /** Cards, inputs */
  card: '#2A2A2A',
  /** Lines, inactive controls */
  border: '#333333',
  /** Brand orange: headers, main buttons, the active tab */
  primary: '#D35400',
  /** Text and icons on the brand orange */
  onPrimary: '#FFFFFF',
  text: '#FFFFFF',
  textMuted: '#BBBBBB',
  /** Inactive tab icons and labels: #9E9E9E on #121212 is about 7:1 */
  tabInactive: '#9E9E9E',
  danger: '#FF5252',
} as const;

export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};

/** The orange header every stack and tab navigator uses */
export const headerOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.onPrimary,
} as const;

/** The tab bar both sides use: customers' and venues' */
export const tabBarOptions: BottomTabNavigationOptions = {
  ...headerOptions,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.tabInactive,
  tabBarStyle: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
  },
};
