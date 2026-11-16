/**
 * What app.json promises the stores (KNOWN_ISSUES 65, 66, 48).
 *
 * Verified on 2026-11-16 against a real merged manifest and Info.plist, built by
 * `npx expo prebuild` plus `:app:processReleaseMainManifest` in a scratch copy of the app (never
 * the repo). These checks keep the settings that produced it from drifting back; a library's own
 * manifest or config plugin can put a permission back, so a change here needs that check again.
 *
 * Merged release manifest, 2026-11-16: ACCESS_COARSE_LOCATION, ACCESS_NETWORK_STATE,
 * ACCESS_WIFI_STATE, CAMERA, FOREGROUND_SERVICE, INTERNET, POST_NOTIFICATIONS, READ_APP_BADGE,
 * RECEIVE_BOOT_COMPLETED, VIBRATE, WAKE_LOCK.
 */
import appJson from '../../app.json';

const android = appJson.expo.android as {
  permissions: string[];
  blockedPermissions: string[];
};
const ios = appJson.expo.ios as { supportsTablet: boolean; infoPlist: Record<string, unknown> };
const plugins = appJson.expo.plugins as (string | [string, Record<string, unknown>])[];

const pluginOptions = (name: string) => {
  const entry = plugins.find((p) => Array.isArray(p) && p[0] === name);
  return Array.isArray(entry) ? entry[1] : undefined;
};

describe('Android permissions', () => {
  // Play requires a declaration for ACCESS_FINE_LOCATION from 27 January 2027; the app sorts
  // venues by distance, which approximate location serves.
  it('asks for approximate location only', () => {
    expect(android.permissions).toContain('android.permission.ACCESS_COARSE_LOCATION');
    expect(android.permissions).not.toContain('android.permission.ACCESS_FINE_LOCATION');
    expect(android.blockedPermissions).toContain('android.permission.ACCESS_FINE_LOCATION');
  });

  // Each of these is declared by a library (expo-location, expo-camera, expo-file-system,
  // react-native's debug manifest) or was left over from Spotify, and app.json's own list
  // cannot drop them: only blockedPermissions removes them from the merged manifest.
  it.each([
    'android.permission.RECORD_AUDIO',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_ADMIN',
    'android.permission.BLUETOOTH_CONNECT'
  ])('removes %s from the merged manifest', (permission) => {
    expect(android.blockedPermissions).toContain(permission);
    expect(android.permissions).not.toContain(permission);
  });
});

describe('iOS', () => {
  it('is an iPhone app', () => {
    expect(ios.supportsTablet).toBe(false);
  });

  // App Review refuses permission texts that do not match what the app does. Nothing uses
  // Bluetooth since Spotify connect went, and the app only needs location while it is open.
  it.each([
    'NSBluetoothAlwaysUsageDescription',
    'NSBluetoothPeripheralUsageDescription',
    'NSLocationAlwaysUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription'
  ])('declares no %s', (key) => {
    expect(ios.infoPlist).not.toHaveProperty(key);
  });

  it('turns expo-location\'s "Always" texts off rather than leaving its defaults', () => {
    expect(pluginOptions('expo-location')).toMatchObject({
      locationAlwaysPermission: false,
      locationAlwaysAndWhenInUsePermission: false,
      isIosBackgroundLocationEnabled: false
    });
    expect(pluginOptions('expo-location')?.locationWhenInUsePermission).toMatch(/location/i);
  });

  // Without the plugin there is no NSCameraUsageDescription, and iOS kills an app that opens
  // the camera without one (KNOWN_ISSUES 66)
  it('has a camera text and no microphone text', () => {
    const camera = pluginOptions('expo-camera');
    expect(camera?.cameraPermission).toMatch(/QR|camera/i);
    expect(camera).toMatchObject({ microphonePermission: false, recordAudioAndroid: false });
  });
});
