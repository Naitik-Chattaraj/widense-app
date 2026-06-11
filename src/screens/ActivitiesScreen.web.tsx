import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Dimensions,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { supabaseService, Project } from '../services/supabaseService';

const { width } = Dimensions.get('window');
const wtLogo = require('../../assets/wt-logo.png');

interface ActivitiesScreenProps {
  user: any;
  navigation: any;
}

export default function ActivitiesScreen({ user, navigation }: ActivitiesScreenProps) {
  const displayName = user?.name || 'Worker';
  
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [userCoord, setUserCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Focus-aware check for active project in AsyncStorage
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const getActiveProject = async () => {
        try {
          const cachedProj = await AsyncStorage.getItem(`active_project_${user.id}`);
          if (cachedProj && active) {
            setActiveProject(JSON.parse(cachedProj));
          } else if (active) {
            setActiveProject(null);
          }
        } catch (e) {
          console.error('[ActivitiesScreenWeb] Error loading active project:', e);
        } finally {
          if (active) setLoading(false);
        }
      };

      getActiveProject();
      return () => {
        active = false;
      };
    }, [user.id])
  );

  // Fetch live tracking coordinates for worker
  useEffect(() => {
    if (!activeProject) {
      setUserCoord(null);
      return;
    }

    const defaultUserLat = activeProject.latitude - 0.008;
    const defaultUserLng = activeProject.longitude - 0.012;

    const fetchLiveLocation = async () => {
      try {
        const { data, error } = await supabase
          .from('user_locations')
          .select('latitude, longitude')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data && !error) {
          setUserCoord({ latitude: data.latitude, longitude: data.longitude });
        } else {
          setUserCoord({ latitude: defaultUserLat, longitude: defaultUserLng });
        }
      } catch (err) {
        setUserCoord({ latitude: defaultUserLat, longitude: defaultUserLng });
      }
    };

    fetchLiveLocation();
    const interval = setInterval(fetchLiveLocation, 6000);
    return () => clearInterval(interval);
  }, [activeProject, user.id]);

  const startNavigation = () => {
    if (!activeProject) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${activeProject.latitude},${activeProject.longitude}`;
    Linking.openURL(url);
  };

  const getDistanceToDestination = () => {
    if (!userCoord || !activeProject) return 0.0;
    
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371; // Earth's radius in km

    const dLat = toRad(activeProject.latitude - userCoord.latitude);
    const dLon = toRad(activeProject.longitude - userCoord.longitude);
    const lat1 = toRad(userCoord.latitude);
    const lat2 = toRad(activeProject.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    if (!userCoord || !activeProject) return;
    const dist = getDistanceToDestination();
    if (dist <= 0.05 && activeProject.status === 'pending') {
      const markArrived = async () => {
        const success = await supabaseService.updateProjectStatus(activeProject.id, 'active');
        if (success) {
          setActiveProject(prev => prev ? { ...prev, status: 'active' } : null);
          const cachedProj = await AsyncStorage.getItem(`active_project_${user.id}`);
          if (cachedProj) {
            const parsed = JSON.parse(cachedProj);
            parsed.status = 'active';
            await AsyncStorage.setItem(`active_project_${user.id}`, JSON.stringify(parsed));
          }
        }
      };
      markArrived();
    }
  }, [userCoord?.latitude, userCoord?.longitude, activeProject?.latitude, activeProject?.longitude, activeProject?.status]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f5474c" />
      </View>
    );
  }

  // Generate real interactive embedded Google Map iframe URL based on selection
  const mapIframeUrl = activeProject
    ? `https://maps.google.com/maps?q=${activeProject.latitude},${activeProject.longitude}&t=&z=14&ie=UTF8&iwloc=&output=embed`
    : '';

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Navbar */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('HomeTab')}>
          <Ionicons name="arrow-back-outline" size={24} color="#1b1464" />
        </TouchableOpacity>

        <Image source={wtLogo} style={styles.logoImage} resizeMode="contain" />

        <View style={styles.placeholderIcon} />
      </View>

      {!activeProject ? (
        // Empty State: No active project/navigation route
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBg}>
            <Ionicons name="navigate" size={48} color="#f5474c" />
          </View>
          <Text style={styles.emptyTitle}>No Navigation Active</Text>
          <Text style={styles.emptyDescription}>
            Start your day and select an assigned site on the home page to launch the interactive guidance view.
          </Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => navigation.navigate('HomeTab')}
          >
            <Text style={styles.emptyCtaText}>Go to Home Tab</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // Navigation Guide Active on Web
        <View style={styles.mapWrapper}>
          <View style={styles.webMapContainer}>
            {Platform.OS === 'web' ? (
              <iframe
                src={mapIframeUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 0,
                }}
                allowFullScreen
                loading="lazy"
                title="Navigation Map"
              />
            ) : (
              <View style={styles.fallbackMap}>
                <Text style={{ color: '#888' }}>Map preview unavailable on native client inside web build</Text>
              </View>
            )}
          </View>

          {/* Floating Navigation Card at top */}
          <View style={styles.floatingHeaderCard}>
            <View style={styles.badgeRow}>
              <View style={styles.activeIndicatorDot} />
              <Text style={styles.badgeText}>GUIDE ROUTE ACTIVE (WEB)</Text>
            </View>
            <Text style={styles.headerProjName} numberOfLines={1}>
              {activeProject.name}
            </Text>
            <Text style={styles.headerProjAddress} numberOfLines={2}>
              {activeProject.location_name}
            </Text>
          </View>

          {/* Navigation panel at bottom */}
          <View style={styles.bottomNavigationCard}>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>ESTIMATED DISTANCE</Text>
                <Text style={styles.statValue}>
                  {getDistanceToDestination().toFixed(2)} km
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>ROUTE STATUS</Text>
                <Text style={[
                  styles.statValue, 
                  { color: (activeProject.status === 'active' || activeProject.status === 'completed' || getDistanceToDestination() <= 0.05) ? '#10B981' : '#f5474c' }
                ]}>
                  {(activeProject.status === 'active' || activeProject.status === 'completed' || getDistanceToDestination() <= 0.05) ? 'ARRIVED' : 'IN ROUTE'}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.navButton} onPress={startNavigation}>
              <Ionicons name="compass" size={20} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.navButtonText}>Launch Google Maps Directions</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
    zIndex: 10,
    backgroundColor: '#FFF',
  },
  logoImage: {
    width: 90,
    height: 40,
  },
  iconButton: {
    padding: 6,
  },
  placeholderIcon: {
    width: 36,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#FFF',
  },
  emptyIconBg: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(245, 71, 76, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 15,
    color: '#4A5568',
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'Roboto_400Regular',
    marginBottom: 32,
  },
  emptyCta: {
    backgroundColor: '#1b1464',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 24,
    boxShadow: '0px 4px 8px rgba(27, 20, 100, 0.2)',
  },
  emptyCtaText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Poppins_600SemiBold',
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  webMapContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#EAEAEA',
  },
  fallbackMap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingHeaderCard: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 16,
    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(240, 240, 240, 0.8)',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  activeIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f5474c',
    marginRight: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#f5474c',
    letterSpacing: 0.8,
    fontFamily: 'Poppins_700Bold',
  },
  headerProjName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
    marginBottom: 4,
  },
  headerProjAddress: {
    fontSize: 13,
    color: '#4A5568',
    fontFamily: 'Roboto_400Regular',
    lineHeight: 18,
  },
  bottomNavigationCard: {
    position: 'absolute',
    bottom: 100, // floating above the tab bar safely
    left: 20,
    right: 20,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    boxShadow: '0px 10px 20px rgba(27, 20, 100, 0.15)',
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: '#E2E8F0',
  },
  statLabel: {
    fontSize: 10,
    color: '#718096',
    fontWeight: 'bold',
    letterSpacing: 0.8,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  navButton: {
    backgroundColor: '#f5474c',
    flexDirection: 'row',
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 8px rgba(245, 71, 76, 0.25)',
  },
  navButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: 'Poppins_600SemiBold',
  },
});
