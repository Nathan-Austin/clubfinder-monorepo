import './global';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert, LogBox } from 'react-native';
import RootNavigator from './src/navigation';
import { AuthProvider } from './src/contexts/AuthContext';
import * as WebBrowser from 'expo-web-browser';
import * as Sentry from 'sentry-expo';
import Constants from 'expo-constants';
import NetworkStatus from './src/components/NetworkStatus';
import networkUtils from './src/utils/networkUtils';
import { PaperProvider } from 'react-native-paper';
import * as tslib from 'tslib';
// Ignore specific warnings
LogBox.ignoreLogs([
  'ViewPropTypes will be removed',
  'AsyncStorage has been extracted',
  'Non-serializable values were found in the navigation state',
]);

// Initialize Sentry for error reporting (optional)
if (!__DEV__) {
  Sentry.init({
    dsn: '', // Add your Sentry DSN
    enableInExpoDevelopment: false,
    debug: false,
  });
}

// Initialize network monitoring
networkUtils.initNetworkMonitoring();

// Ensure authentication session can complete properly
WebBrowser.maybeCompleteAuthSession();

export default function App() {
  // Add application-level error handling
  useEffect(() => {
    // Handle uncaught JavaScript errors
    const errorHandler = (error: Error, isFatal?: boolean) => {
      if (isFatal) {
        Alert.alert(
          'Unexpected Error',
          'An unexpected error occurred. Please restart the app.',
          [{ text: 'OK' }]
        );
      }

      // Log to console in development
      if (__DEV__) {
        console.error('Uncaught error:', error);
      } else {
        // Report to Sentry in production
        Sentry.Native.captureException(error);
      }
    };

    // Set up global error handler
    ErrorUtils.setGlobalHandler(errorHandler);

    return () => {
      // Reset error handler on unmount
      ErrorUtils.setGlobalHandler(() => { });
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PaperProvider>
          {console.log('App.tsx ts helper keys', Object.keys(tslib).slice(0, 5))}
          <StatusBar style="light" />
          <RootNavigator />
          <NetworkStatus showOfflineOnly={true} />
        </PaperProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
