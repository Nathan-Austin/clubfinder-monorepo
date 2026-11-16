/**
 * Shown when venues could not be loaded at all (no network, the server down, no usable cache),
 * with a way to try again. Until 2026-11-16 the app showed made-up Berlin venues ("Club XYZ,
 * 123 Main St") in that case, which looked like real results in any city.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  message?: string;
  onRetry: () => void;
  retrying?: boolean;
};

const LoadError = ({ message = "We couldn't load venues just now.", onRetry, retrying = false }: Props) => (
  <View style={styles.container} testID="load-error">
    <Ionicons name="cloud-offline-outline" size={36} color="#CCCCCC" />
    <Text style={styles.message}>{message}</Text>
    <Text style={styles.hint}>Check your connection and try again.</Text>
    <TouchableOpacity
      style={[styles.button, retrying && styles.buttonDisabled]}
      onPress={onRetry}
      disabled={retrying}
      accessibilityRole="button"
      testID="load-error-retry"
    >
      <Text style={styles.buttonText}>{retrying ? 'Trying again…' : 'Try again'}</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    marginVertical: 12
  },
  message: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginTop: 10, textAlign: 'center' },
  hint: { color: '#CCCCCC', fontSize: 13, marginTop: 4, textAlign: 'center' },
  button: {
    marginTop: 16,
    backgroundColor: '#D35400',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 6
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold' }
});

export default LoadError;
