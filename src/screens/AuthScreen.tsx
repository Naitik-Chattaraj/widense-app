import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

const { width, height } = Dimensions.get('window');

const signInBigBg = require('../../assets/sign-in-big-bg.png');
const signUpBigBg = require('../../assets/sign-up-big-bg.png');
const smallBg = require('../../assets/sign-in-or-up-small-bg.png');
const wtLogo = require('../../assets/wt-logo.png');

interface AuthScreenProps {
  onLoginSuccess: (user: any) => void;
}

export default function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const [isSignIn, setIsSignIn] = useState<boolean>(true);
  const [lastUserName, setLastUserName] = useState<string | null>(null);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if a user has previously signed in
    AsyncStorage.getItem('widense_user')
      .then((userString) => {
        if (userString) {
          const user = JSON.parse(userString);
          const storedName = user?.name || user?.display_name || null;
          setLastUserName(storedName);
          setIsSignIn(true); // default to Sign In if previous session exists
        } else {
          setIsSignIn(false); // default to Sign Up for new users
        }
      })
      .catch(() => {
        setIsSignIn(false);
      });
  }, []);

  const handleAuth = async () => {
    setError(null);

    // Basic empty fields validation
    if (!email || !password || (!isSignIn && !name)) {
      setError('Please fill in all fields.');
      return;
    }

    // Client-side password length validation to catch 422 errors locally
    if (!isSignIn && password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      if (isSignIn) {
        // Sign In
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) throw authError;

        onLoginSuccess(data.user);
      } else {
        // Sign Up
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name,
            },
          },
        });

        if (authError) throw authError;

        Alert.alert(
          'Sign Up Successful',
          'Please check your email for a verification link.'
        );
        setIsSignIn(true);
      }
    } catch (err: any) {
      console.error('[AuthScreen] Authentication failed:', err);
      
      // Friendly message translation for Supabase errors
      let friendlyMessage = err.message || 'An unexpected error occurred.';
      if (friendlyMessage.includes('weak_password') || friendlyMessage.includes('at least 6 characters')) {
        friendlyMessage = 'Password must be at least 6 characters long.';
      } else if (friendlyMessage.includes('already registered') || friendlyMessage.includes('User already exists')) {
        friendlyMessage = 'This email is already registered. Please sign in instead.';
      } else if (friendlyMessage.includes('Invalid login credentials')) {
        friendlyMessage = 'Incorrect email or password. Please try again.';
      }
      
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Wave Wavy Background */}
      <Image
        source={isSignIn ? signInBigBg : signUpBigBg}
        style={isSignIn ? styles.topBgImageSignIn : styles.topBgImageSignUp}
        resizeMode="stretch"
      />

      {/* Bottom Wave Wavy Background */}
      <Image
        source={smallBg}
        style={styles.bottomBgImage}
        resizeMode="cover"
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header Row: Logo & Sign In / Sign Up Switcher */}
          <View style={styles.headerRow}>
            <View style={styles.logoContainer}>
              <Image source={wtLogo} style={styles.logoImage} resizeMode="contain" />
            </View>

            {/* Switcher */}
            <View style={styles.switcher}>
              <TouchableOpacity onPress={() => setIsSignIn(true)}>
                <Text
                  style={[
                    styles.switcherText,
                    isSignIn && styles.switcherTextActive,
                  ]}
                >
                  Sign In
                </Text>
                {isSignIn && <View style={styles.activeLine} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsSignIn(false)}>
                <Text
                  style={[
                    styles.switcherText,
                    !isSignIn && styles.switcherTextActive,
                  ]}
                >
                  Sign Up
                </Text>
                {!isSignIn && <View style={styles.activeLine} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Form Content */}
          <View style={styles.formContainer}>
            <Text style={styles.welcomeText}>
              {isSignIn
                ? `Welcome back,${lastUserName ? `\n${lastUserName}` : ''}`
                : 'Create an Account'}
            </Text>

            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={20} color="#f5474c" style={{ marginRight: 8 }} />
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            )}

            {!isSignIn && (
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Howard Crawford"
                  placeholderTextColor="#BBB"
                  value={name}
                  onChangeText={setName}
                />
              </View>
            )}

            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="howard1990@gmail.com"
                placeholderTextColor="#BBB"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••••••"
                placeholderTextColor="#BBB"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={styles.button}
              onPress={handleAuth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {isSignIn ? 'Sign In' : 'Sign Up'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.forgotButton}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    overflow: 'hidden',
  },
  topBgImageSignIn: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: width * 0.72,
    height: height * 0.48,
  },
  topBgImageSignUp: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width * 1,
    height: height * 0.5,
  },
  bottomBgImage: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: height * 0.09,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    width: 95,
    height: 48,
    marginTop: 50,
  },
  switcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  switcherText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
  switcherTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  activeLine: {
    height: 2.5,
    backgroundColor: '#FFF',
    marginTop: 4,
    borderRadius: 1.5,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    marginTop: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEAEA',
    borderColor: '#FE7F7F',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
  },
  errorBannerText: {
    flex: 1,
    color: '#f5474c',
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Roboto_500Medium',
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#222',
    lineHeight: 40,
    marginBottom: 35,
    fontFamily: 'Poppins_700Bold',
  },
  inputWrapper: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0', // Slate gray border
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 20,
    elevation: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464', // Deep Indigo shadow
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      web: {
        boxShadow: '0px 4px 6px rgba(27, 20, 100, 0.05)',
      },
    }),
  },
  inputLabel: {
    fontSize: 12,
    color: '#1b1464', // Deep Indigo label text
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 4,
  },
  input: {
    fontSize: 16,
    color: '#333',
    padding: 0,
    fontFamily: 'Roboto_400Regular', // Roboto for text input
  },
  button: {
    backgroundColor: '#f5474c', // Coral Red primary button background
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    elevation: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      web: {
        boxShadow: '0px 6px 10px rgba(27, 20, 100, 0.2)',
      },
    }),
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
  },
  forgotButton: {
    alignItems: 'center',
    marginTop: 24,
  },
  forgotText: {
    color: '#f5474c', // Coral Red for Forgot Password link
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
});
