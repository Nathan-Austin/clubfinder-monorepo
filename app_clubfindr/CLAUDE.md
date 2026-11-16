# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tilki (formerly clubfindr-mobile) is a React Native mobile application for discovering venues (bars/clubs) that match the user's music taste. The app has dual user types: customers who discover venues, and bar managers who manage their business profiles.

## Commands

### Development
```bash
# Start Expo development server
npm start

# Run on specific platforms
npm run android  # Android emulator/device
npm run ios      # iOS simulator (macOS only)
npm run web      # Web browser

# Install dependencies
npm install

# Clear cache and reinstall
npx expo start -c
```

### Build & Deployment
**Always set `EAS_NO_VCS=1`.** `app_clubfindr/` holds an old nested `.git` (KNOWN_ISSUES 34), so
with version control on, EAS packs that repository's last commit (2026-01-27), not the current
code. With it set, EAS packs the folder minus `.easignore`. EAS CLI must run on Node 24 (the app
needs Node >= 20.19.4), logged in as the project owner `adminclubfindr` (`eas whoami`).
```bash
# Installable APK for a phone (profile "preview"), built on this machine, ~20 min
EAS_NO_VCS=1 eas build --platform android --profile preview --local --output clubfindr-preview.apk

# Play Store bundle (profile "release", an .aab; `npm run build:android` also bumps the version)
EAS_NO_VCS=1 eas build --platform android --profile release --local

# Submit to app stores
eas submit
```

### Code Quality
CI (`.github/workflows/app-clubfindr-ci.yml`, Node 24 from `.nvmrc`) runs all four of these and
fails on any of them; a failure blocks the web deploy too, so run them before committing:
```bash
npm run lint        # ESLint; errors fail, warnings do not
npm run typecheck   # tsc --noEmit
npm test            # Jest (jest-expo preset)
npx expo export --platform android --output-dir /tmp/expo-export   # bundles the whole app
```

## Architecture

### Tech Stack
- **React Native 0.81** with **Expo SDK 54** (see `package.json`)
- **TypeScript 5.9** with strict mode
- **React Navigation v7** for routing
- **React Context API** for state management
- **Axios** with interceptors for API calls
- **AsyncStorage** for persistence
- **React Native Paper** for Material Design UI

### Project Structure
```
src/
├── api/axiosClient.ts       # The HTTP client: axios over services/NativeFetchService
├── components/              # Reusable UI (CitySection, LoadError, LoginTypeModal, VenueCard…)
├── config/env.ts            # API_URL and endpoint names
├── constants/
│   ├── cities.ts            # Covered cities + centres (= data_collection/live_cities.txt)
│   └── unified-genres.json
├── contexts/AuthContext.tsx # Session, user type, changeCity
├── hooks/useCityProposal.ts # "You seem to be in Paris. Switch?"
├── navigation/index.tsx
├── screens/
├── services/
│   ├── NativeFetchService.ts # fetch + auth header; keeps the status of non-JSON errors
│   ├── discoveryService.ts   # Venues, location, caches
│   ├── cityService.ts        # The one place that reads and saves the user's city
│   ├── mobileBarService.ts   # Venue register/confirm/login
│   └── tasteService.ts       # Taste profile (artist picker, search)
├── types/api.ts             # HttpError, errorMessage/errorStatus, ApiEvent, ApiBarData
└── utils/
    ├── logger.ts            # log.debug/info (dev only), installConsoleGuard
    ├── VenueCache.ts        # Nearby-venue cache (not per city: cleared on a city change)
    └── NetworkCache.ts
```

### Authentication Flow
The app has two user types, each with its own login:
1. **Customers**: Can discover venues from their taste profile
2. **Bar Managers**: Can manage business profiles, view analytics

The session token is the server's `user_sessions` (customer) or `bar_sessions` (venue) id, stored
in AsyncStorage as `authToken`; NativeFetchService sends it as `Authorization: Bearer` on every
request. It is not a JWT and is not refreshed: it expires on the server after 7 (customer) or 30
(venue) days without use. The `AuthContext` handles:
- Login/logout for both user types; the venue login accepts the venue's own credentials or the
  personal account that registered it (server `$lib/server/venueLogin`)
- `changeCity`, which saves to the account and clears the venue caches
- User type switching

### API Integration
- **Every build talks to production**: `API_URL` is `https://www.clubfindr.com` (in
  `config/env.ts`, `api/axiosClient.ts` and `services/NativeFetchService.ts`). A build installed
  before a web deploy runs against the old server, so a new endpoint must fail safely there (a
  404 reaches the caller as a 404: see `services/cityService.ts`)
- `api/axiosClient` is axios with an adapter over NativeFetchService; `params` go into the URL,
  failed requests carry `error.response.status`
- In a `catch`, use `errorMessage(error, fallback)` / `errorStatus(error)` from `types/api.ts`,
  not `error: any`
- Services layer abstracts API calls

### Navigation Structure
- Conditional rendering based on auth state and user type
- Stack navigator for authentication flow
- Bottom tabs for main app (different for customers vs bar managers)
- Modal stack for detail screens

### Key Features

#### Taste profile (no streaming login)
- Users pick artists (`ArtistPickerScreen`, `services/tasteService.ts`); their genres drive
  Discover, the Search tab's artist search and matching. Search goes through the server's own
  Spotify app (`/api/taste/search`), never a user's Spotify account
- Per-account and per-venue Spotify connect are retired (server ROADMAP section 1);
  `utils/legacySpotify.ts` clears tokens older builds left in AsyncStorage

#### QR Code System
- QR generation for venues (`react-native-qrcode-svg`)
- QR scanning for check-ins (`expo-camera`)
- Screens: `QRScannerScreen.tsx`, `QRCodeGeneratorScreen.tsx`

#### Location and city
- **Approximate location only** (`Accuracy.Low`, Android `ACCESS_COARSE_LOCATION`): Play wants a
  declaration for fine location from 27 January 2027
- The user's city is `users.city` on the server and `userCity` in AsyncStorage. Read it with
  `cityForQueries()` from `services/cityService.ts`, never `AsyncStorage.getItem('userCity') ||
  'berlin'`; change it with `AuthContext.changeCity` (`PUT /api/account/city`)
- No fix → no position in a release build; under `__DEV__` the centre of the user's city
- No venues loadable → `components/LoadError` with "Try again"; never made-up venues

#### Caching System
- `utils/VenueCache.ts` (nearby) and discoveryService's own cache, 30 minutes, not per city
- Offline support with `@react-native-community/netinfo`; an expired cache beats an error

## Environment Configuration

There is no `.env` for the API: the URL is hard-coded to production (see API Integration).

## Testing

Tests use Jest (`jest-expo` preset, config in `package.json`) with React Native Testing
Library. Run tests with:
```bash
npm test
```

Test files follow the pattern `*.test.ts(x)` in `__tests__` folders (e.g.
`src/utils/__tests__/localDate.test.ts`). Nothing runs on a device in CI, so put logic that
matters (dates, matching, parsing) in plain functions with unit tests. Jest runs from this folder:
use `path.resolve(...)`, not `__dirname` (not a global the lint config knows).

Some tests read source or config rather than run code, because what they guard only shows on a
device:
- `screens/__tests__/textInputs.test.ts`: every `TextInput` sets `placeholderTextColor`, its
  style a `color`, and e-mail fields `autoCorrect={false}` (KNOWN_ISSUES 69)
- `utils/__tests__/noPersonalDataInLogs.test.ts`: no console call logs an e-mail, password, token
  or code
- `__tests__/appConfig.test.ts`: the permissions and Info.plist settings below
- `constants/__tests__/cities.test.ts`: the city list matches `live_cities.txt` and the web's

The checklist for a device run is `DEVICE_CHECKLIST.md`.

## Development Notes

### Code Style
- ESLint configured for TypeScript and React Native
- Follow existing patterns in the codebase
- Components use functional React with hooks
- Prefer TypeScript strict typing

### Common Patterns
- Services return typed responses
- Error handling with try-catch in async functions
- Loading states managed in components
- Network errors handled gracefully with cache fallback

### State Management
- Global auth state in AuthContext
- Local component state with useState
- No Redux or MobX - use Context API for shared state

### Logging
`console.log/info/debug` print nothing in a release build (`installConsoleGuard` in `App.tsx`).
New code uses `log.debug`/`log.info` (development only) and `log.warn`/`log.error` (every build)
from `utils/logger.ts`, and never logs personal data or credentials.

### Permissions
**`app.json` does not decide the permissions by itself** (KNOWN_ISSUES 76): libraries declare
their own in their manifests, and `expo-location`'s config plugin is applied even when not listed.
- Android: `ACCESS_COARSE_LOCATION`, `CAMERA` (from the expo-camera plugin), network. What
  libraries add and the app does not use is in `android.blockedPermissions`. `expo-notifications`
  still brings its own (KNOWN_ISSUES 77)
- iOS: iPhone only (`supportsTablet: false`); exactly two usage texts, camera (expo-camera plugin,
  microphone off) and when-in-use location (expo-location plugin, "Always" off)
- To check a change: copy the app to a scratch folder (never prebuild into this one), symlink
  `node_modules`, then `EAS_NO_VCS=1 npx expo prebuild --platform android --clean --no-install`
  and `SENTRY_DISABLE_AUTO_UPLOAD=true ./gradlew :app:processReleaseMainManifest`; the merged
  manifest is under `android/app/build/intermediates/merged_manifest/release/`. For iOS, prebuild
  `--platform ios` and read `ios/*/Info.plist`
- `eas.json` uses `appVersionSource: "local"`: versions live in `app.json`, and
  `scripts/bump-version.js` bumps `versionCode`