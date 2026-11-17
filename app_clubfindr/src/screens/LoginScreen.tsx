import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Image,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Keyboard,
  TextInput as RNTextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import axiosClient from '../api/axiosClient';
import networkUtils from '../utils/networkUtils';
import { LoginResponse } from '../types/auth';
import LoginTypeModal from '../components/LoginTypeModal';
import * as WebBrowser from 'expo-web-browser';
import { API_URL } from '../config/env';
import { loginErrorMessage } from '../utils/loginErrors';
import { log } from '../utils/logger';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation';

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const LoginScreen = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Logging in...');
  const { loginWithCredentials, barLogin } = useAuth();
  const [isBarLoginMode, setIsBarLoginMode] = useState(false);
  const [showLoginTypeModal, setShowLoginTypeModal] = useState(false);

  // References for the TextInputs
  const passwordInputRef = useRef<RNTextInput>(null);

  // Set up loading message animation
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;

    if (isLoggingIn) {
      interval = setInterval(() => {
        setLoadingMessage(current => {
          switch (current) {
            case 'Logging in...': return 'Logging in.';
            case 'Logging in.': return 'Logging in..';
            case 'Logging in..': return 'Logging in...';
            default: return 'Logging in...';
          }
        });
      }, 500);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoggingIn]);

  // Navigate to signup screen
  const goToSignup = () => {
    navigation.navigate('Signup');
  };

  // Navigate to email verification
  const goToEmailVerification = (email: string) => {
    navigation.navigate('EmailVerification', { email });
  };

  // The web's reset page, which since 2026-11-16 also resets a venue's own login (KNOWN_ISSUES
  // 68); `from=bars` sends a venue back to the venue login afterwards. The page has always
  // existed, so this works against a server without that change too: a venue then just gets
  // no e-mail.
  const openPasswordReset = () => {
    const from = isBarLoginMode ? '?from=bars' : '';
    WebBrowser.openBrowserAsync(`${API_URL}/password-reset${from}`).catch((error) =>
      console.error('Could not open the password reset page:', error)
    );
  };

  // Toggle login mode modal
  const toggleLoginTypeModal = () => {
    setShowLoginTypeModal(!showLoginTypeModal);
  };

  // Select login type
  const selectLoginType = (isBar: boolean) => {
    setIsBarLoginMode(isBar);
    setShowLoginTypeModal(false);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    Keyboard.dismiss();
    setIsLoggingIn(true);

    try {
      if (isBarLoginMode) {
        // Bar manager login
        await barLogin(email, password);
        return;
      }

      log.debug('Starting login request...');
      const loginStart = Date.now();

      // First check network connection
      try {
        const networkInfo = await networkUtils.getNetworkState();
        log.debug('Network diagnostics:', JSON.stringify(networkInfo));

        if (!networkInfo.isConnected) {
          throw new Error('No internet connection. Please check your network settings and try again.');
        }
      } catch (networkError) {
        // Continue anyway - we'll try the request
        log.debug('Network check error:', networkError);
      }

      // No fallback to the web's /login/users (KNOWN_ISSUES 81): it ran on every failure, a wrong
      // password's 401 included, sent the password a second time, and replaced the server's
      // "Invalid credentials" with whatever the second request answered
      const loginResponse = await axiosClient.post('/api/mobile/login', {
        email,
        password,
        isMobileApp: true
      });

      const data = loginResponse.data as LoginResponse;
      log.debug(`Login request took: ${Date.now() - loginStart}ms`);

      if (data.success && data.token && data.user) {
        log.debug('Login successful, checking email verification...');

        // Check if email is verified
        if (data.user.emailVerified === false) {
          Alert.alert(
            'Email Not Verified',
            'Please verify your email before logging in.',
            [
              {
                text: 'Verify Now',
                onPress: () => {
                  setIsLoggingIn(false);
                  goToEmailVerification(email);
                }
              },
              {
                text: 'Later',
                style: 'cancel',
                onPress: () => setIsLoggingIn(false)
              }
            ]
          );
          return;
        }

        // Always set onboarding_complete to true to avoid the welcome screen
        const normalizedUser = {
          ...data.user,
          onboarding_complete: true,
          onboardingComplete: true,
          isFirstTimeUser: false
        };

        // Complete the login
        await loginWithCredentials(normalizedUser, data.token);
        return;
      }

      throw new Error(data.message || 'Login failed');
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = loginErrorMessage(error);
      Alert.alert('Login Failed', errorMessage);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContainer}
        enableOnAndroid={true}
        keyboardShouldPersistTaps="handled"
        extraScrollHeight={Platform.OS === 'ios' ? 80 : 100}
        scrollEnabled
      >
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/tilki-fox-logo.png')}
            style={styles.logo}
            width={120}
            height={120}
            resizeMode="contain"
            accessible={true}
            accessibilityLabel="Tilki Fox Logo"
          />
          <Text style={styles.title}>Tilki</Text>
          <Text style={styles.subtitle}>Hunt down your music vibe</Text>
        </View>

        <View style={styles.form}>
          <TouchableOpacity
            style={styles.loginTypeSelector}
            onPress={toggleLoginTypeModal}
          >
            <Text style={styles.loginTypeText}>
              {isBarLoginMode ? 'Bar Manager Login' : 'User Login'}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#FFFFFF" />
          </TouchableOpacity>

          <LoginTypeModal
            visible={showLoginTypeModal}
            isBarLoginMode={isBarLoginMode}
            onSelect={selectLoginType}
            onClose={() => setShowLoginTypeModal(false)}
          />

          <TextInput
            autoCorrect={false}
            placeholderTextColor="#666"
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            importantForAutofill="yes"
            testID="email-input"
            returnKeyType="next"
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            blurOnSubmit={false}
          />

          <TextInput
            ref={passwordInputRef}
            placeholderTextColor="#666"
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            importantForAutofill="yes"
            testID="password-input"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={isLoggingIn}
            testID="login-button"
          >
            {isLoggingIn ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.loadingText}>{loadingMessage}</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotPassword}
            onPress={openPasswordReset}
            testID="forgot-password-button"
          >
            <Text style={styles.forgotPasswordText}>Forgot password?</Text>
          </TouchableOpacity>

          <View style={styles.signupContainer}>
            <Text style={styles.orText}>Don't have an account?</Text>
            <TouchableOpacity
              style={styles.signupButton}
              onPress={goToSignup}
              testID="signup-button"
            >
              <Text style={styles.signupButtonText}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {!isBarLoginMode && (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.barRegistrationButton}
                onPress={() => navigation.navigate('BarRegistration')}
                testID="bar-registration-button"
              >
                <Text style={styles.barRegistrationButtonText}>Bar Registration</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: colors.text,
    opacity: 0.8,
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: colors.white,
    // Explicit, or the Android theme picks one: white on this white field on some phones
    // (KNOWN_ISSUES 69)
    color: colors.black,
    padding: 15,
    borderRadius: 5,
    marginBottom: 15,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonText: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  loadingContainer: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.text,
    marginTop: 8,
    fontSize: 14,
  },
  forgotPassword: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 5,
  },
  forgotPasswordText: {
    color: colors.primary,
    fontSize: 14,
  },
  orText: {
    color: colors.text,
    marginVertical: 10,
  },
  signupContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  signupButton: {
    backgroundColor: colors.transparent,
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.white,
    width: '100%',
    marginTop: 10,
  },
  signupButtonText: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.grey600,
  },
  dividerText: {
    color: colors.text,
    marginHorizontal: 10,
    fontSize: 14,
  },
  barRegistrationButton: {
    backgroundColor: colors.grey800,
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    width: '100%',
  },
  barRegistrationButtonText: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: 16,
  },
  loginTypeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    backgroundColor: colors.grey800,
    padding: 10,
    borderRadius: 5,
  },
  loginTypeText: {
    color: colors.text,
    marginRight: 5,
  },
});

export default LoginScreen;
