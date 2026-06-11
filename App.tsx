import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, StatusBar, Platform, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { Roboto_400Regular, Roboto_500Medium, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { supabase } from './src/supabase';
import { supabaseService } from './src/services/supabaseService';

// Screens
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import ActivitiesScreen from './src/screens/ActivitiesScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AdminHomeScreen from './src/screens/AdminHomeScreen';
import AdminMapScreen from './src/screens/AdminMapScreen';

const Tab = createBottomTabNavigator();

export interface UserSession {
  id: string;
  email: string;
  name: string;
  admin: boolean;
  avatar_url: string | null;
}

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number = 5000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    )
  ]);
};

export default function App() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fontTimeout, setFontTimeout] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<boolean>(false);

  // Load both Roboto and Poppins fonts
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
  });

  // Safe timeout for fonts to ensure it never hangs in offline mode
  useEffect(() => {
    const timer = setTimeout(() => {
      setFontTimeout(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const checkSession = async () => {
    setLoading(true);
    setConnectionError(false);
    try {
      const sessionResult = await withTimeout(supabase.auth.getSession(), 5000);
      const session = sessionResult.data.session;

      if (session) {
        // Fetch profile with a strict timeout to avoid infinite loading screens in offline mode
        const profile = await withTimeout(
          supabaseService.getProfile(
            session.user.id,
            session.user.email,
            session.user.user_metadata?.display_name
          ),
          5000
        );

        if (profile) {
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: profile.display_name || session.user.user_metadata?.display_name || 'Worker',
            admin: profile.admin || false,
            avatar_url: profile.avatar_url || null,
          });
        } else {
          // If profile could not be loaded, show connection error
          setConnectionError(true);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('[App] Session check error:', err);
      setConnectionError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSession();

    // Subscribe to Auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setLoading(true);
        setConnectionError(false);
        try {
          const profile = await withTimeout(
            supabaseService.getProfile(
              session.user.id,
              session.user.email,
              session.user.user_metadata?.display_name
            ),
            5000
          );

          if (profile) {
            setUser({
              id: session.user.id,
              email: session.user.email || '',
              name: profile.display_name || session.user.user_metadata?.display_name || 'Worker',
              admin: profile.admin || false,
              avatar_url: profile.avatar_url || null,
            });
          } else {
            setConnectionError(true);
          }
        } catch (e) {
          console.error('[App] Auth state update error:', e);
          setConnectionError(true);
        } finally {
          setLoading(false);
        }
      } else {
        setUser(null);
        setLoading(false);
        setConnectionError(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLoginSuccess = async (loggedInUser: any) => {
    setLoading(true);
    setConnectionError(false);
    try {
      const profile = await withTimeout(
        supabaseService.getProfile(
          loggedInUser.id,
          loggedInUser.email,
          loggedInUser.user_metadata?.display_name
        ),
        5000
      );

      if (profile) {
        setUser({
          id: loggedInUser.id,
          email: loggedInUser.email || '',
          name: profile.display_name || loggedInUser.user_metadata?.display_name || 'Worker',
          admin: profile.admin || false,
          avatar_url: profile.avatar_url || null,
        });
      } else {
        setConnectionError(true);
      }
    } catch (err) {
      console.error('[App] Login success callback error:', err);
      setConnectionError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    // Fire-and-forget Supabase signOut in background to prevent network/offline hangs
    supabase.auth.signOut().catch(err => {
      console.warn('[App] Background Supabase signOut failed:', err);
    });

    // Delay state clearing by 50ms to allow React Native Web's touch responder
    // to complete its click event before the button is unmounted from the DOM.
    setTimeout(() => {
      setUser(null);
      setConnectionError(false);
    }, 50);
  };

  // Show Connection Retry UI if profile fetching fails due to network/db issues
  if (connectionError) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
        <Ionicons name="cloud-offline-outline" size={64} color="#f5474c" style={{ marginBottom: 16 }} />
        <Text style={styles.errorTitle}>Connection Failed</Text>
        <Text style={styles.errorMessage}>
          We couldn't retrieve your user profile from Widense. Please check your internet connection and try again.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={checkSession}>
          <Text style={styles.retryBtnText}>Retry Connection</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout}>
          <Text style={styles.signOutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show loading indicator - resilient to font loading hangs
  if (loading || (!fontsLoaded && !fontTimeout)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f5474c" />
      </View>
    );
  }

  // Show Auth if not logged in
  if (!user) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor="#1b1464" />
        <AuthScreen onLoginSuccess={handleLoginSuccess} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <NavigationContainer>
        {user.admin ? (
          // Admin Tab Navigator Shell
          <Tab.Navigator
            id={undefined}
            screenOptions={({ route }: any) => ({
              headerShown: false,
              tabBarShowLabel: false,
              tabBarStyle: styles.tabBar,
              tabBarActiveTintColor: '#f5474c', // Coral Red active
              tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.4)',
              tabBarIcon: ({ focused, color }: any) => {
                let iconName: keyof typeof Ionicons.glyphMap = 'home-outline';
                if (route.name === 'AdminHomeTab') {
                  iconName = focused ? 'home' : 'home-outline';
                  return (
                    <View style={[styles.homeIconContainer, focused && styles.homeIconActive]}>
                      <Ionicons name={iconName} size={22} color={focused ? '#1b1464' : '#FFF'} />
                    </View>
                  );
                } else if (route.name === 'AdminMapTab') {
                  iconName = focused ? 'map' : 'map-outline';
                } else if (route.name === 'SettingsTab') {
                  iconName = focused ? 'settings' : 'settings-outline';
                }
                return <Ionicons name={iconName} size={24} color={color} />;
              },
            })}
          >
            <Tab.Screen
              name="AdminHomeTab"
              children={(props: any) => <AdminHomeScreen {...props} user={user} />}
            />
            <Tab.Screen
              name="AdminMapTab"
              children={(props: any) => <AdminMapScreen {...props} user={user} />}
            />
            <Tab.Screen
              name="SettingsTab"
              children={(props: any) => (
                <SettingsScreen
                  {...props}
                  user={user}
                  onLogout={handleLogout}
                  onUpdateUser={(updatedFields: any) => setUser(prev => prev ? { ...prev, ...updatedFields } : null)}
                />
              )}
            />
          </Tab.Navigator>
        ) : (
          // Field Worker Tab Navigator Shell
          <Tab.Navigator
            id={undefined}
            screenOptions={({ route }: any) => ({
              headerShown: false,
              tabBarShowLabel: false,
              tabBarStyle: styles.tabBar,
              tabBarActiveTintColor: '#f5474c', // Coral Red active
              tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.4)',
              tabBarIcon: ({ focused, color }: any) => {
                let iconName: keyof typeof Ionicons.glyphMap = 'home-outline';
                if (route.name === 'HomeTab') {
                  iconName = focused ? 'home' : 'home-outline';
                  return (
                    <View style={[styles.homeIconContainer, focused && styles.homeIconActive]}>
                      <Ionicons name={iconName} size={22} color={focused ? '#1b1464' : '#FFF'} />
                    </View>
                  );
                } else if (route.name === 'ActivitiesTab') {
                  iconName = focused ? 'location' : 'location-outline';
                } else if (route.name === 'CalendarTab') {
                  iconName = focused ? 'calendar' : 'calendar-outline';
                } else if (route.name === 'SettingsTab') {
                  iconName = focused ? 'settings' : 'settings-outline';
                }
                return <Ionicons name={iconName} size={24} color={color} />;
              },
            })}
          >
            <Tab.Screen
              name="HomeTab"
              children={(props: any) => <HomeScreen {...props} user={user} />}
            />
            <Tab.Screen
              name="ActivitiesTab"
              children={(props: any) => <ActivitiesScreen {...props} user={user} />}
            />
            <Tab.Screen
              name="CalendarTab"
              children={(props: any) => <CalendarScreen {...props} user={user} />}
            />
            <Tab.Screen
              name="SettingsTab"
              children={(props: any) => (
                <SettingsScreen
                  {...props}
                  user={user}
                  onLogout={handleLogout}
                  onUpdateUser={(updatedFields: any) => setUser(prev => prev ? { ...prev, ...updatedFields } : null)}
                />
              )}
            />
          </Tab.Navigator>
        )}
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  tabBar: {
    backgroundColor: '#1b1464',
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    borderRadius: 32,
    height: 68,
    paddingBottom: Platform.OS === 'ios' ? 10 : 0, 
    borderTopWidth: 0,
    elevation: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      web: {
        boxShadow: '0px 10px 16px rgba(27, 20, 100, 0.3)',
      },
    }),
  },
  homeIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeIconActive: {
    backgroundColor: '#f5474c', // Coral Red active accent
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'Roboto_400Regular',
    marginBottom: 28,
  },
  retryBtn: {
    backgroundColor: '#f5474c',
    borderRadius: 16,
    height: 52,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#f5474c',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      web: {
        boxShadow: '0px 6px 10px rgba(245, 71, 76, 0.2)',
      },
    }),
    marginBottom: 12,
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
  },
  signOutBtn: {
    height: 48,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutBtnText: {
    color: '#f5474c',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
});
