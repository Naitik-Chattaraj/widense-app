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
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { supabaseService, Project } from '../services/supabaseService';

const { width, height } = Dimensions.get('window');
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
  const webviewRef = React.useRef<WebView>(null);

  const leafletHTML = React.useMemo(() => {
    if (!activeProject) return '';
    const initialLat = userCoord?.latitude || activeProject.latitude;
    const initialLng = userCoord?.longitude || activeProject.longitude;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body, #map { width: 100%; height: 100%; }
          .leaflet-control-attribution { font-size: 10px; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: true }).setView([${initialLat}, ${initialLng}], 14);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          }).addTo(map);

          var workerMarker = null;
          var destinationMarker = null;
          var routeLine = null;

          window.updateRoute = function(workerLat, workerLng, destLat, destLng, workerName, destName) {
            try {
              var destIcon = L.divIcon({
                html: '<div style="width: 38px; height: 38px; border-radius: 19px; background-color: #1b1464; border: 2px solid #FFF; display: flex; justify-content: center; align-items: center; box-shadow: 0px 3px 4px rgba(0,0,0,0.3);"><span style="color: #FFF; font-family: sans-serif; font-style: normal; font-weight: bold; font-size: 18px;">📍</span></div>',
                className: 'custom-dest-icon',
                iconSize: [38, 38],
                iconAnchor: [19, 19]
              });

              var workerIcon = L.divIcon({
                html: '<div style="width: 24px; height: 24px; border-radius: 12px; background-color: rgba(245, 71, 76, 0.25); display: flex; justify-content: center; align-items: center; border: 1px solid rgba(245, 71, 76, 0.4);"><div style="width: 12px; height: 12px; border-radius: 6px; background-color: #f5474c; border: 1.5px solid #FFF;"></div></div>',
                className: 'custom-worker-icon',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              });

              if (destinationMarker) {
                destinationMarker.setLatLng([destLat, destLng]);
              } else {
                destinationMarker = L.marker([destLat, destLng], { icon: destIcon }).addTo(map);
                destinationMarker.bindPopup("<b>" + destName + "</b>");
              }

              if (workerLat && workerLng) {
                if (workerMarker) {
                  workerMarker.setLatLng([workerLat, workerLng]);
                } else {
                  workerMarker = L.marker([workerLat, workerLng], { icon: workerIcon }).addTo(map);
                  workerMarker.bindPopup("<b>" + workerName + " (You)</b>");
                }
              }

              if (workerLat && workerLng) {
                var coords = [
                  [workerLat, workerLng],
                  [destLat, destLng]
                ];
                if (routeLine) {
                  routeLine.setLatLngs(coords);
                } else {
                  routeLine = L.polyline(coords, {
                    color: '#f5474c',
                    weight: 4,
                    dashArray: '6, 6'
                  }).addTo(map);
                }
                map.fitBounds(coords, { padding: [50, 50] });
              } else {
                map.setView([destLat, destLng], 14);
              }
            } catch(e) {
              console.error(e);
            }
          };
        </script>
      </body>
      </html>
    `;
  }, [activeProject?.id]);

  useEffect(() => {
    if (activeProject && userCoord && webviewRef.current) {
      const js = `
        if (typeof window.updateRoute === 'function') {
          window.updateRoute(
            ${userCoord.latitude}, 
            ${userCoord.longitude}, 
            ${activeProject.latitude}, 
            ${activeProject.longitude}, 
            '${displayName.replace(/'/g, "\\'")}', 
            '${activeProject.name.replace(/'/g, "\\'")}'
          );
        }
        true;
      `;
      webviewRef.current.injectJavaScript(js);
    }
  }, [userCoord?.latitude, userCoord?.longitude, activeProject?.id, webviewRef.current]);

  // Fetch active project whenever screen gains focus
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
          console.error('[ActivitiesScreen] Error loading active project:', e);
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

  // Pull live location of worker to update map pin representation in real-time
  useEffect(() => {
    if (!activeProject) {
      setUserCoord(null);
      return;
    }

    // Default mock start position: offset from destination
    const defaultUserLat = activeProject.latitude - 0.008;
    const defaultUserLng = activeProject.longitude - 0.012;

    const fetchLiveCoord = async () => {
      try {
        const { data, error } = await supabase
          .from('user_locations')
          .select('latitude, longitude')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data && !error) {
          setUserCoord({ latitude: data.latitude, longitude: data.longitude });
        } else {
          // If no active row, fall back to mock location close by
          setUserCoord({ latitude: defaultUserLat, longitude: defaultUserLng });
        }
      } catch (err) {
        setUserCoord({ latitude: defaultUserLat, longitude: defaultUserLng });
      }
    };

    fetchLiveCoord();
    const interval = setInterval(fetchLiveCoord, 6000);
    return () => clearInterval(interval);
  }, [activeProject, user.id]);

  const startNavigation = () => {
    if (!activeProject) return;
    const scheme = Platform.select({
      ios: 'maps://0,0?q=',
      android: 'geo:0,0?q=',
    });
    const latLng = `${activeProject.latitude},${activeProject.longitude}`;
    const label = encodeURIComponent(activeProject.name);
    
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${latLng}`,
    });

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          const webUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeProject.location_name)}`;
          Linking.openURL(webUrl);
        }
      })
      .catch(() => {
        Alert.alert('Error', 'Could not launch device navigation application.');
      });
  };

  const [drivingDistance, setDrivingDistance] = useState<number | null>(null);

  // Fetch actual driving distance via OSRM (OpenStreetMap Routing) instead of straight-line
  useEffect(() => {
    if (!userCoord || !activeProject) return;

    const fetchRouteDistance = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${userCoord.longitude},${userCoord.latitude};${activeProject.longitude},${activeProject.latitude}?overview=false`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          // Distance is returned in meters, convert to km
          const distKm = data.routes[0].distance / 1000;
          setDrivingDistance(distKm);

          // If distance is <= 0.05 km and project status is pending, mark as active (arrived) in Supabase!
          if (distKm <= 0.05 && activeProject.status === 'pending') {
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
          }
        }
      } catch (err) {
        console.warn('Failed to fetch driving route distance:', err);
      }
    };

    // Debounce fetching to avoid hitting rate limits when live location bounces
    const timeout = setTimeout(fetchRouteDistance, 1000);
    return () => clearTimeout(timeout);
  }, [userCoord?.latitude, userCoord?.longitude, activeProject?.latitude, activeProject?.longitude, activeProject?.status]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f5474c" />
      </View>
    );
  }

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
        // Navigation Guide Active
        <View style={styles.mapWrapper}>
          <WebView
            ref={webviewRef}
            source={{ html: leafletHTML }}
            style={styles.map}
            originWhitelist={['*']}
            domStorageEnabled
            javaScriptEnabled
            onLoadEnd={() => {
              if (activeProject && userCoord && webviewRef.current) {
                const js = `
                  if (typeof window.updateRoute === 'function') {
                    window.updateRoute(
                      ${userCoord.latitude}, 
                      ${userCoord.longitude}, 
                      ${activeProject.latitude}, 
                      ${activeProject.longitude}, 
                      '${displayName.replace(/'/g, "\\'")}', 
                      '${activeProject.name.replace(/'/g, "\\'")}'
                    );
                  }
                  true;
                `;
                webviewRef.current.injectJavaScript(js);
              }
            }}
          />

          {/* Floating Navigation Card at top */}
          <View style={styles.floatingHeaderCard}>
            <View style={styles.badgeRow}>
              <View style={styles.activeIndicatorDot} />
              <Text style={styles.badgeText}>GUIDE ROUTE ACTIVE</Text>
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
                <Text style={styles.statLabel}>DISTANCE LEFT</Text>
                <Text style={styles.statValue}>
                  {drivingDistance !== null ? `${drivingDistance.toFixed(2)} km` : 'Calculating...'}
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>ROUTE STATUS</Text>
                <Text style={[
                  styles.statValue, 
                  { color: (activeProject.status === 'active' || activeProject.status === 'completed' || (drivingDistance !== null && drivingDistance <= 0.05)) ? '#10B981' : '#f5474c' }
                ]}>
                  {(activeProject.status === 'active' || activeProject.status === 'completed' || (drivingDistance !== null && drivingDistance <= 0.05)) ? 'ARRIVED' : 'IN ROUTE'}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.navButton} onPress={startNavigation}>
              <Ionicons name="compass" size={20} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.navButtonText}>Launch Google/Apple Maps</Text>
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
    elevation: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      web: {
        boxShadow: '0px 4px 8px rgba(27, 20, 100, 0.2)',
      },
    }),
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
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  destinationMarker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1b1464',
    borderWidth: 2,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      web: {
        boxShadow: '0px 3px 4px rgba(0, 0, 0, 0.3)',
      },
    }),
  },
  workerMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 71, 76, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 71, 76, 0.4)',
  },
  workerMarkerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#f5474c',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  floatingHeaderCard: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 16,
    elevation: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      web: {
        boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
      },
    }),
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
    elevation: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
      },
      web: {
        boxShadow: '0px 10px 20px rgba(27, 20, 100, 0.15)',
      },
    }),
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
    backgroundColor: '#f5474c', // Coral Red guide button
    flexDirection: 'row',
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#f5474c',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      web: {
        boxShadow: '0px 4px 8px rgba(245, 71, 76, 0.25)',
      },
    }),
  },
  navButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: 'Poppins_600SemiBold',
  },
});
