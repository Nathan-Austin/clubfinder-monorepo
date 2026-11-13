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
```bash
# Build APK for Android (configured in eas.json)
eas build --platform android --profile preview

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
├── api/           # HTTP client with interceptors
├── components/    # Reusable UI components
├── config/        # Environment configuration
├── constants/     # App constants (genres, etc.)
├── contexts/      # Global state providers
│   └── AuthContext.tsx  # Auth state, JWT management
├── navigation/    # Navigation setup
├── screens/       # Screen components
├── services/      # Business logic
│   ├── discoveryService.ts  # Venue discovery
│   ├── tasteService.ts      # Taste profile (artist picker, search)
│   └── barManagementService.ts
├── types/         # TypeScript definitions
└── utils/
    └── cache.ts   # Network-aware caching
```

### Authentication Flow
The app uses JWT authentication with two user types:
1. **Customers**: Can discover venues from their taste profile
2. **Bar Managers**: Can manage business profiles, view analytics

Auth tokens are stored in AsyncStorage and automatically refreshed. The `AuthContext` handles:
- Login/logout for both user types
- Token persistence and refresh
- User type switching

### API Integration
- Base URL configured via environment variables in `.env`
- Axios interceptors add auth headers automatically
- API client configured in `src/api/httpClient.ts`
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

#### Location Services
- GPS-based venue discovery
- Uses `expo-location`
- Permissions handled in app.json

#### Caching System
- Network-aware data caching in `src/utils/cache.ts`
- Offline support with `@react-native-community/netinfo`
- Automatic cache invalidation

## Environment Configuration

Environment variables are loaded from `.env` using `react-native-dotenv`:
- `API_BASE_URL`: Backend API endpoint

## Testing

Tests use Jest (`jest-expo` preset, config in `package.json`) with React Native Testing
Library. Run tests with:
```bash
npm test
```

Test files follow the pattern `*.test.ts(x)` in `__tests__` folders (e.g.
`src/utils/__tests__/localDate.test.ts`). Nothing runs on a device in CI, so put logic that
matters (dates, matching, parsing) in plain functions with unit tests.

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

### Permissions
The app requires:
- Location (fine/coarse) for venue discovery
- Camera for QR scanning
- Bluetooth (declared in `app.json` for the retired Spotify integration; review before the next release)
- Network access for API calls