# app_clubfindr Analysis

**Priority: MEDIUM**
**Last Updated: 2026-01-18**

## Component Overview

### Purpose
React Native/Expo mobile application (branded as "Tilki") for discovering music events and connecting artists with venues. Provides mobile access to the Clubfinder platform.

### Tech Stack
- **Framework**: React Native 0.81.5 with Expo SDK 54
- **Language**: TypeScript 5.9
- **Navigation**: React Navigation v7 (stack + bottom tabs)
- **State Management**: React Context + AsyncStorage
- **UI**: React Native Paper + custom components + react-native-reanimated
- **APIs**: Spotify OAuth, Google Maps, clubfindr backend
- **Error Tracking**: Sentry (configured, needs org/project setup for production)

### Current State
The app is now **building successfully** and running on Android devices. Spotify OAuth is working correctly. The app has been migrated from Expo Router to traditional React Navigation. APK builds are functional via EAS Build (local).

## Architecture

### File Structure
```
app_clubfindr/
├── App.tsx               # Root component with providers
├── src/
│   ├── api/              # HTTP client with interceptors
│   ├── components/       # Reusable UI components
│   ├── config/           # Environment configuration
│   ├── constants/        # App constants (genres, etc.)
│   ├── contexts/         # React Context providers (AuthContext)
│   ├── hooks/            # Custom hooks
│   ├── navigation/       # React Navigation setup (RootNavigator)
│   ├── screens/          # Screen components
│   ├── services/         # Business logic (discovery, spotify, barManagement)
│   ├── types/            # TypeScript definitions
│   └── utils/            # Utility functions (cache, network)
├── assets/               # Images, fonts, icons
├── app.json              # Expo configuration
└── eas.json              # EAS Build configuration
```

### Key Patterns
- Traditional React Navigation with stack + bottom tab navigators
- Context-based state management (AuthContext for JWT + user type)
- Service layer for API calls with Axios interceptors
- Centralized type definitions
- Network-aware caching system

## Resolved Issues

### 1. Spotify OAuth on Android ✅
**Status**: RESOLVED (2026-01-18)
**Location**: `services/spotifyService.ts`

The Spotify OAuth flow is now working correctly on Android devices. The implementation uses `expo-auth-session` with proper redirect URI handling.

### 2. Build Configuration ✅
**Status**: RESOLVED (2026-01-18)

Fixed build issues:
- Removed `expo-router` from plugins (app uses React Navigation, not file-based routing)
- Removed `web.output: "server"` config (expo-router specific feature)
- Added `SENTRY_DISABLE_AUTO_UPLOAD=true` to eas.json preview profile (source map upload requires Sentry org/project config)
- Updated `@sentry/react-native` to ~7.2.0 for Expo SDK 54 compatibility

## Remaining Issues

### 1. Unhandled Async Errors
**Severity**: Medium
**Location**: Multiple files in `services/` and `screens/`

Some async operations could benefit from better error handling:
- API calls in useEffect without cleanup
- Could add more user-facing error states for network failures

**Impact**: Minor - app has basic error handling but could be improved.

### 2. Sentry Configuration Incomplete
**Severity**: Low
**Location**: `app.json`, `App.tsx`

Sentry is integrated but needs organization and project configuration for production error tracking. Currently disabled for builds via `SENTRY_DISABLE_AUTO_UPLOAD`.

**To enable**: Add Sentry organization and project to app.json plugins config.

## Technical Debt

### 1. Zero Test Coverage
**Files Affected**: Entire codebase
**Current State**: Only 1 test file exists (`__tests__/app.test.tsx`) with minimal coverage

```
Estimated coverage: <1%
Test files: 1
Test assertions: ~2
```

**Recommended Action**: Implement testing strategy starting with:
1. Critical user flows (auth, event discovery)
2. Service layer unit tests
3. Component integration tests

### 2. Excessive Console.log Statements
**Count**: 501+ statements
**Locations**: Throughout all files

This causes:
- Performance degradation
- Potential PII leakage in logs
- Noise in debugging

**Files with Most Logs**:
- `screens/ExploreScreen.tsx` - 45+ logs
- `services/spotifyAuth.ts` - 30+ logs
- `contexts/AuthContext.tsx` - 25+ logs

### 3. TypeScript `any` Usage
**Count**: 144 instances
**Risk**: Type safety undermined

**Worst Offenders**:
- `services/api.ts` - 20+ any
- `types/index.ts` - 15+ any
- `screens/*.tsx` - Scattered throughout

### 4. Large Screen Components
**Threshold Exceeded**: Multiple files over 500 LOC

| File | Lines | Recommendation |
|------|-------|----------------|
| `screens/EventDetailScreen.tsx` | 958 | Split into sub-components |
| `screens/ExploreScreen.tsx` | 847 | Extract hooks, split UI |
| `screens/ProfileScreen.tsx` | 623 | Modularize sections |
| `screens/ArtistProfileScreen.tsx` | 589 | Component extraction |

### 5. Missing Error Boundaries
**Location**: App-wide
**Impact**: Single component errors can crash entire app

No React error boundaries are implemented. A single uncaught error in any component will crash the app.

### 6. AsyncStorage Without Encryption
**Location**: `utils/storage.ts`, `contexts/AuthContext.tsx`
**Risk**: Sensitive tokens stored in plaintext

User tokens and session data are stored in AsyncStorage without encryption. On rooted/jailbroken devices, this data is accessible.

### 7. Hardcoded API URLs
**Location**: `services/api.ts`, `constants/config.ts`
**Issue**: Environment-specific URLs mixed with code

### 8. Missing Loading States
**Location**: Multiple screens
**Issue**: No skeleton loaders or proper loading indicators for async operations

## Improvement Checklist

### Completed ✅
- [x] Fix Spotify OAuth crash on Android
- [x] Fix EAS Build configuration
- [x] Migrate from Expo Router to React Navigation
- [x] Integrate Sentry for error tracking (basic setup)

### High Priority (This Sprint)
- [ ] Configure Sentry with organization/project for production
- [ ] Add unit tests for services layer (target: 50% coverage)
- [ ] Replace `any` types with proper TypeScript types
- [ ] Remove or gate console.log statements for production

### Medium Priority (Next Sprint)
- [ ] Refactor large screen components (>500 LOC)
- [ ] Add integration tests for critical user flows
- [ ] Implement proper loading states and skeletons
- [ ] Add network error recovery UI

### Lower Priority (Backlog)
- [ ] Add E2E tests with Detox
- [ ] Implement offline mode with data sync
- [ ] Enable Sentry source map uploads for readable stack traces
- [ ] Optimize bundle size and startup time
- [ ] Add accessibility features (a11y)

## Verification Steps

### Building APK Locally
```bash
cd app_clubfindr

# Check for dependency issues first
npx expo-doctor

# Build APK locally (requires Android SDK)
npx eas-cli build --platform android --profile preview --local

# Or build on EAS servers (no local SDK needed)
npx eas-cli build --platform android --profile preview
```

### Running on Emulator
```bash
cd app_clubfindr
npx expo start
# Press 'a' to run on Android emulator
```

### Testing Spotify OAuth
```bash
# 1. Install APK on device or run on emulator
# 2. Navigate to profile/settings
# 3. Tap "Connect Spotify"
# 4. Complete OAuth flow in browser
# 5. Verify redirect back to app and successful connection
```

### Checking Test Coverage
```bash
cd app_clubfindr
npm test -- --coverage

# Target metrics:
# - Statements: >50%
# - Branches: >40%
# - Functions: >50%
# - Lines: >50%
```

### Console.log Audit
```bash
# Count remaining logs
grep -r "console\." --include="*.ts" --include="*.tsx" app_clubfindr/src | wc -l

# Should be 0 in production code
# Acceptable: Logger utility with dev/prod toggle
```

## Dependencies to Review

| Package | Version | Status |
|---------|---------|--------|
| @sentry/react-native | ~7.2.0 | ✅ Updated for Expo SDK 54 |
| react-native | 0.81.5 | ✅ Current |
| expo | 54.0.31 | ✅ Current |
| @react-navigation/* | v7 | ✅ Working |

### Known Build Warnings (Non-blocking)
These warnings appear during build but don't affect functionality:
- `@react-native-community/netinfo` - deprecated API usage
- `@react-native-community/datetimepicker` - deprecated `currentActivity` property
- `react-native-safe-area-context` - deprecated `uiImplementation`
- Transitive dependencies: `inflight`, `rimraf@3`, `glob@7`, `q` (deprecated but functional)

## Related Components

- **clubfindr**: Provides backend API
- **spotify_service**: Handles Spotify app credentials
- **barfindr**: Venue-specific endpoints

## Notes

The app is now **production-ready for testing**. Core functionality (OAuth, navigation, API integration) is working. Key items before full production release:

1. Configure Sentry with organization/project for error tracking
2. Audit and reduce console.log statements
3. Add test coverage for critical paths

### Build Configuration
- **EAS Build Profile**: `preview` outputs APK, `release` outputs APK
- **Sentry**: Auto-upload disabled in preview builds (`SENTRY_DISABLE_AUTO_UPLOAD=true`)
- **Bundle ID**: `com.clubfindr.mobile`
- **App Name**: Tilki
