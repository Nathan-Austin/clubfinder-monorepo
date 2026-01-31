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
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import axiosClient from '../api/axiosClient';
import networkUtils from '../utils/networkUtils';
import * as mobileSpotifyService from '../services/mobileSpotifyService';
import { LoginResponse } from '../types/auth';

// Simplified navigation type
type LoginScreenNavigationProp = StackNavigationProp<any>;

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

      console.log('Starting login request...');
      const loginStart = Date.now();

      // First check network connection
      try {
        const networkInfo = await networkUtils.getNetworkState();
        console.log('Network diagnostics:', JSON.stringify(networkInfo));

        if (!networkInfo.isConnected) {
          throw new Error('No internet connection. Please check your network settings and try again.');
        }
      } catch (networkError) {
        // Continue anyway - we'll try the request
        console.log('Network check error:', networkError);
      }

      let loginResponse;
      try {
        loginResponse = await axiosClient.post('/api/mobile/login', {
          email,
          password,
          isMobileApp: true
        });
      } catch (error) {
        console.log('Optimized endpoint failed, trying fallback...', error);
        loginResponse = await axiosClient.post('/login/users', {
          email,
          password,
          provider: 'local',
          isMobileApp: true
        });
      }

      const data = loginResponse.data as LoginResponse;
      console.log(`Login request took: ${Date.now() - loginStart}ms`);

      if (data.success && data.token && data.user) {
        console.log('Login successful, checking email verification...');

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

        // Store Spotify client credentials if available
        if (data.user.clientId) {
          console.log('Storing Spotify client credentials from login response');
          await mobileSpotifyService.storeClientCredentials(
            data.user.clientId,
            data.user.clientSecret || ''
          );
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

      // Provide a more specific error message based on the error
      let errorMessage = 'Could not log in. Please check your credentials and try again.';

      if (error instanceof Error) {
        if (error.message.includes('network') || error.message.includes('timeout') ||
          error.message.includes('abort') || error.message.includes('Network request failed')) {
          errorMessage = 'Network error. Please check your internet connection and try again.';
        } else if (error.message.includes('incorrect') || error.message.includes('invalid') ||
          error.message.includes('wrong')) {
          errorMessage = 'Email or password incorrect. Please try again.';
        } else if (error.message.includes('verify') || error.message.includes('verification')) {
          errorMessage = 'Email not verified. Please check your email for a verification link.';
        }
      }

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

          <Modal
            visible={showLoginTypeModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowLoginTypeModal(false)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowLoginTypeModal(false)}
            >
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Login Type</Text>

                <TouchableOpacity
                  style={[styles.loginTypeOption, !isBarLoginMode && styles.selectedOption]}
                  onPress={() => selectLoginType(false)}
                >
                  <Ionicons
                    name={!isBarLoginMode ? "radio-button-on" : "radio-button-off"}
                    size={24}
                    color={!isBarLoginMode ? "#D35400" : "#FFFFFF"}
                  />
                  <Text style={styles.loginOptionText}>Customer Login</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.loginTypeOption, isBarLoginMode && styles.selectedOption]}
                  onPress={() => selectLoginType(true)}
                >
                  <Ionicons
                    name={isBarLoginMode ? "radio-button-on" : "radio-button-off"}
                    size={24}
                    color={isBarLoginMode ? "#D35400" : "#FFFFFF"}
                  />
                  <Text style={styles.loginOptionText}>Bar Manager Login</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.closeModalButton}
                  onPress={() => setShowLoginTypeModal(false)}
                >
                  <Text style={styles.closeModalText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>

          <TextInput
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
    backgroundColor: '#121212',
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
    color: '#D35400',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 5,
    marginBottom: 15,
  },
  button: {
    backgroundColor: '#D35400',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loadingContainer: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 8,
    fontSize: 14,
  },
  orText: {
    color: '#FFFFFF',
    marginVertical: 10,
  },
  signupContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  signupButton: {
    backgroundColor: 'transparent',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    width: '100%',
    marginTop: 10,
  },
  signupButtonText: {
    color: '#FFFFFF',
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
    backgroundColor: '#555555',
  },
  dividerText: {
    color: '#FFFFFF',
    marginHorizontal: 10,
    fontSize: 14,
  },
  barRegistrationButton: {
    backgroundColor: '#333333',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D35400',
    width: '100%',
  },
  barRegistrationButtonText: {
    color: '#D35400',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loginTypeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    backgroundColor: '#333333',
    padding: 10,
    borderRadius: 5,
  },
  loginTypeText: {
    color: '#FFFFFF',
    marginRight: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#222222',
    width: '80%',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  loginTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginVertical: 5,
    paddingHorizontal: 10,
  },
  selectedOption: {
    backgroundColor: 'rgba(211, 84, 0, 0.2)',
    borderRadius: 5,
  },
  loginOptionText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginLeft: 10,
  },
  closeModalButton: {
    backgroundColor: '#D35400',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 20,
  },
  closeModalText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});

export default LoginScreen;
