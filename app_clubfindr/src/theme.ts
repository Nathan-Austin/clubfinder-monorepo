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
  // ---- The core tokens: what new code should reach for ----
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
  /** Secondary text on the dark screens */
  textSecondary: '#CCCCCC',
  textMuted: '#BBBBBB',
  /** Inactive tab icons and labels: #9E9E9E on #121212 is about 7:1 */
  tabInactive: '#9E9E9E',
  danger: '#FF5252',
  /** Text on a white card (the QR share card) */
  textOnLight: '#333333',

  // ---- The rest of the colours the screens use, by value (KNOWN_ISSUES 80, lint step 10) ----
  // Kept exactly as they were, so the move changes nothing on screen. Several are near-duplicates
  // of a core token (dangerBright and danger, grey800 and card); folding them together is a
  // visual change and wants a device run, so it is left for later.
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  surfaceDark: '#1A1A1A',
  surfaceAlt: '#222222',
  /** Fills in #333333 (buttons, inputs, chips); `border` is the same value for lines */
  grey800: '#333333',
  grey700: '#444444',
  grey600: '#555555',
  grey500: '#666666',
  grey400: '#999999',
  grey350: '#AAAAAA',
  grey300: '#B3B3B3',
  grey200: '#DDDDDD',
  primaryDark: '#5D2E0F',
  primaryA10: 'rgba(211, 84, 0, 0.1)',
  primaryA20: 'rgba(211, 84, 0, 0.2)',
  /** The green of "add" buttons and genre tags */
  green: '#1DB954',
  greenA10: 'rgba(29, 185, 84, 0.1)',
  greenA20: 'rgba(29, 185, 84, 0.2)',
  /** Week-on-week up and down in the venue stats */
  positive: '#4CAF50',
  negative: '#F44336',
  warning: '#FF9800',
  warningSoft: '#F39C12',
  dangerBright: '#FF4D4F',
  dangerVivid: '#FF4444',
  dangerLight: '#FF8A80',
  dangerDark: '#400000',
  dangerA20: 'rgba(255, 82, 82, 0.2)',
  purple: '#6200EA',
  purpleDark: '#4A148C',
  purpleA10: 'rgba(98, 0, 234, 0.1)',
  overlaySoft: 'rgba(0, 0, 0, 0.5)',
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayStrong: 'rgba(0, 0, 0, 0.9)',
  whiteA05: 'rgba(255, 255, 255, 0.05)',
  whiteA10: 'rgba(255, 255, 255, 0.1)',
  whiteA15: 'rgba(255, 255, 255, 0.15)',
  whiteA20: 'rgba(255, 255, 255, 0.2)',
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
