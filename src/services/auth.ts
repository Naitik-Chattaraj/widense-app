import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// In development, localhost works for web/iOS simulator.
// Android emulator needs 10.0.2.2 to access the host's localhost.
// For physical devices (Expo Go), change the IP to your computer's local IP (e.g., '192.168.1.100')
const getApiUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000';
  }
  return 'http://localhost:5000';
};

export const API_URL = getApiUrl();
console.log('[AuthService] Using Backend API URL:', API_URL);

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  requiresVerification?: boolean;
  token?: string;
  user?: User;
  error?: string;
}

export const authService = {
  // Register a new user
  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Registration failed' };
      }
      
      return { success: true, message: data.message, requiresVerification: true };
    } catch (err: any) {
      console.error('[AuthService Register Error]', err);
      return { success: false, error: 'Could not connect to authentication server. Please make sure the server is running.' };
    }
  },

  // Login a user (password check)
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }

      if (data.requiresVerification) {
        return { success: true, requiresVerification: true, message: data.message };
      }

      // Store JWT token and user info
      await AsyncStorage.setItem('widense_token', data.token);
      await AsyncStorage.setItem('widense_user', JSON.stringify(data.user));

      return { success: true, user: data.user, token: data.token };
    } catch (err: any) {
      console.error('[AuthService Login Error]', err);
      return { success: false, error: 'Could not connect to authentication server. Please make sure the server is running.' };
    }
  },

  // Verify OTP
  async verifyOtp(email: string, otp: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Verification failed' };
      }

      // Store JWT token and user info upon successful OTP verification
      await AsyncStorage.setItem('widense_token', data.token);
      await AsyncStorage.setItem('widense_user', JSON.stringify(data.user));

      return { success: true, user: data.user, token: data.token };
    } catch (err: any) {
      console.error('[AuthService Verify OTP Error]', err);
      return { success: false, error: 'Could not connect to authentication server.' };
    }
  },

  // Resend OTP
  async resendOtp(email: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/api/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Resending OTP failed' };
      }

      return { success: true, message: data.message };
    } catch (err: any) {
      console.error('[AuthService Resend OTP Error]', err);
      return { success: false, error: 'Could not connect to authentication server.' };
    }
  },

  // Request Password Reset OTP
  async forgotPassword(email: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to request reset' };
      }

      return { success: true, message: data.message };
    } catch (err: any) {
      console.error('[AuthService Forgot Password Error]', err);
      return { success: false, error: 'Could not connect to authentication server.' };
    }
  },

  // Reset Password using OTP
  async resetPassword(email: string, otp: string, newPasswordHex: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword: newPasswordHex }),
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to reset password' };
      }

      return { success: true, message: data.message };
    } catch (err: any) {
      console.error('[AuthService Reset Password Error]', err);
      return { success: false, error: 'Could not connect to authentication server.' };
    }
  },

  // Log Out (Clear saved session locally)
  async logout(): Promise<void> {
    try {
      await AsyncStorage.removeItem('widense_token');
      await AsyncStorage.removeItem('widense_user');
    } catch (err) {
      console.error('[AuthService Logout Error]', err);
    }
  },

  // Get active session on load
  async getSession(): Promise<User | null> {
    try {
      const token = await AsyncStorage.getItem('widense_token');
      const userString = await AsyncStorage.getItem('widense_user');

      if (!token || !userString) {
        return null;
      }

      // Optional: Check if token is still valid with backend
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          return data.user;
        } else {
          // If token expired/invalid, clear session
          await this.logout();
          return null;
        }
      } catch (e) {
        // If server is offline, fallback to using stored offline session for robust UX
        console.warn('[AuthService] Server offline, using cached session offline');
        return JSON.parse(userString);
      }
    } catch (err) {
      console.error('[AuthService GetSession Error]', err);
      return null;
    }
  }
};
