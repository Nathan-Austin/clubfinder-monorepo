# Spotify OAuth Emulator Crash Investigation - SDK 54

## Issue Summary
- **Problem**: Android emulator crashes when initiating Spotify OAuth via WebBrowser.openAuthSessionAsync()
- **When**: After migrating from Expo SDK 52 to SDK 54
- **Where**: Crash occurs after OAuth initialization logs but before browser opens
- **Impact**: Whole emulator shuts down, not just app crash

## Current Configuration
- **Expo SDK**: 54.0.10
- **expo-web-browser**: ~15.0.6
- **expo-auth-session**: ~7.0.7
- **React Native**: 0.81.4 (with SDK 54)
- **New Architecture**: ENABLED (`"newArchEnabled": true`)
- **Android Engine**: Hermes
- **Deep Link Scheme**: `clubfindr://spotify-auth-callback`

## What Works
✅ OAuth initialization (client ID retrieval, PKCE generation)
✅ Authorization URL creation
✅ Code verifier and challenge generation
✅ All preliminary setup completes successfully

## What Crashes
❌ `WebBrowser.openAuthSessionAsync()` call causes immediate emulator shutdown
❌ No JavaScript error logs (native crash)
❌ Happens consistently on every OAuth attempt

## Research Findings

### Known Issues with expo-web-browser on Android
1. **Android Emulator Instability**: Multiple GitHub issues reporting crashes with `WebBrowser.openAuthSessionAsync()` on Android emulators
2. **SDK 54 Compatibility**: New Architecture conflicts with some native modules
3. **Hermes Engine Issues**: Potential compatibility problems with auth sessions

### Root Cause Analysis
- **NOT related to tslib polyfills** (those were successfully removed)
- **Native module crash** during WebBrowser session initialization
- **SDK migration side effect** from 52→54 upgrade

## Potential Solutions (Priority Order)

### 1. Quick Fixes (app.json changes)
```json
{
  "expo": {
    "newArchEnabled": false,  // Disable New Architecture
    "plugins": [
      "expo-router",
      "expo-web-browser"      // Add missing plugin
    ]
  }
}
```

### 2. WebBrowser Configuration Updates
```javascript
// In mobileSpotifyService.ts, update WebBrowser call:
const result = await WebBrowser.openAuthSessionAsync(
    authUrl,
    SPOTIFY_REDIRECT_URI,
    {
        showInRecents: false,           // Prevent session conflicts
        preferEphemeralSession: true,   // Don't persist cookies
        createTask: false               // Android-specific fix
    }
);
```

### 3. Alternative OAuth Implementation
Replace `WebBrowser.openAuthSessionAsync()` with `AuthSession.startAsync()`:
```javascript
import * as AuthSession from 'expo-auth-session';

// Use AuthSession instead of WebBrowser
const result = await AuthSession.startAsync({
    authUrl: authUrl,
    returnUrl: SPOTIFY_REDIRECT_URI
});
```

### 4. Enhanced Error Handling
```javascript
try {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri, options);
    return result;
} catch (error) {
    console.error('WebBrowser session failed:', error);
    // Fallback to external browser
    await WebBrowser.openBrowserAsync(authUrl);
    throw new Error('Auth session failed, opened in external browser');
}
```

### 5. Development Client Migration
- Move away from Expo Go for OAuth testing
- Create development build with `expo install expo-dev-client`
- Better native module support and debugging

## Files to Modify
1. **app.json** - Disable new architecture, add plugins
2. **src/services/mobileSpotifyService.ts** - Update WebBrowser configuration
3. **package.json** - Verify expo-web-browser version compatibility

## Testing Strategy
1. Try fixes in order (quickest first)
2. Test each change on Android emulator
3. Monitor Metro logs for any new errors
4. Verify OAuth flow completes without crashes

## Alternative Workarounds
- Test on physical Android device instead of emulator
- Use iOS simulator for OAuth testing (may be more stable)
- Implement web-based OAuth fallback for development

## GitHub Issues Referenced
- expo/expo#15276 - Android app switch issues
- expo/expo#27500 - Redirect problems on Android
- expo/expo#33112 - Expo Go crashes on Android API 35
- Multiple reports of WebBrowser crashes on Android emulators

## Next Steps for Tomorrow
1. Start with app.json quick fixes (disable new architecture)
2. If that fails, try WebBrowser configuration updates
3. Consider AuthSession.startAsync() as alternative
4. Document results and iterate through solutions

## Notes
- The OAuth implementation itself is correct (works until WebBrowser call)
- Issue is specifically with native WebBrowser module on Android emulator
- SDK 54 introduced stricter native module requirements
- New Architecture may be incompatible with current expo-web-browser version