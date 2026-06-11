import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { supabaseService, UserLocation } from '../services/supabaseService';

const { height } = Dimensions.get('window');

interface AdminMapScreenProps {
  user: any;
}

export default function AdminMapScreen({ user }: AdminMapScreenProps) {
  const [activeLocations, setActiveLocations] = useState<UserLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedUserLocation, setSelectedUserLocation] = useState<UserLocation | null>(null);
  const webviewRef = React.useRef<WebView>(null);

  const loadLocations = async () => {
    try {
      const locs = await supabaseService.getActiveLocations();
      setActiveLocations(locs);
      if (locs.length > 0 && !selectedUserLocation) {
        setSelectedUserLocation(locs[0]);
      }
    } catch (err) {
      console.error('[AdminMap] Error loading locations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
    // Set up polling for active locations (every 10 seconds)
    const interval = setInterval(() => {
      loadLocations();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Base leaflet HTML for showing workers
  const leafletHTML = React.useMemo(() => {
    const initialLat = selectedUserLocation?.latitude || 22.5134;
    const initialLng = selectedUserLocation?.longitude || 88.4012;

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
          var map = L.map('map', { zoomControl: true }).setView([${initialLat}, ${initialLng}], 12);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          }).addTo(map);

          var markers = {};

          window.updateMarkers = function(locationsStr, selectedId) {
            try {
              var locations = JSON.parse(locationsStr);
              
              // Remove old markers
              var currentIds = locations.map(function(l) { return l.user_id; });
              for (var id in markers) {
                if (currentIds.indexOf(id) === -1) {
                  map.removeLayer(markers[id]);
                  delete markers[id];
                }
              }

              // Add/update markers
              locations.forEach(function(loc) {
                var lat = loc.latitude;
                var lng = loc.longitude;
                var isSelected = loc.user_id === selectedId;

                var iconUrl = isSelected 
                  ? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' 
                  : 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png';

                var icon = L.icon({
                  iconUrl: iconUrl,
                  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                  iconSize: [25, 41],
                  iconAnchor: [12, 41],
                  popupAnchor: [1, -34],
                  shadowSize: [41, 41]
                });

                if (markers[loc.user_id]) {
                  markers[loc.user_id].setLatLng([lat, lng]);
                  markers[loc.user_id].setIcon(icon);
                } else {
                  var m = L.marker([lat, lng], { icon: icon }).addTo(map);
                  m.on('click', function() {
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SELECT_USER', userId: loc.user_id }));
                    }
                  });
                  markers[loc.user_id] = m;
                }
              });
            } catch(e) {
              console.error(e);
            }
          };

          window.centerOn = function(lat, lng) {
            map.setView([lat, lng], 13);
          };
        </script>
      </body>
      </html>
    `;
  }, []);

  // Update WebView markers dynamically when activeLocations or selectedUserLocation changes
  useEffect(() => {
    if (activeLocations.length > 0) {
      const locationsData = activeLocations.map(loc => ({
        user_id: loc.user_id,
        latitude: loc.latitude,
        longitude: loc.longitude,
        profiles: { display_name: loc.profiles?.display_name }
      }));
      const js = `
        if (typeof window.updateMarkers === 'function') {
          window.updateMarkers('${JSON.stringify(locationsData).replace(/'/g, "\\'")}', '${selectedUserLocation?.user_id || ''}');
        }
        true;
      `;
      webviewRef.current?.injectJavaScript(js);
    }
  }, [activeLocations, selectedUserLocation, webviewRef.current]);

  const handleWebViewMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SELECT_USER') {
        const found = activeLocations.find(l => l.user_id === msg.userId);
        if (found) {
          setSelectedUserLocation(found);
        }
      }
    } catch (e) {}
  };

  // Center map on selected worker from list
  const handleSelectUser = (loc: UserLocation) => {
    setSelectedUserLocation(loc);
    const js = `
      if (typeof window.centerOn === 'function') {
        window.centerOn(${loc.latitude}, ${loc.longitude});
      }
      true;
    `;
    webviewRef.current?.injectJavaScript(js);
  };

  if (loading && activeLocations.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f5474c" />
        <Text style={styles.loadingText}>Connecting to active trackers...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Navbar */}
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.headerTitle}>Live Crew Tracker</Text>
          <Text style={styles.headerSubtitle}>
            {activeLocations.length} active worker{activeLocations.length !== 1 ? 's' : ''} online
          </Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadLocations}>
          <Ionicons name="refresh" size={22} color="#f5474c" />
        </TouchableOpacity>
      </View>

      <View style={styles.contentGrid}>
        {/* MAP PANEL */}
        <View style={styles.mapContainer}>
          <WebView
            ref={webviewRef}
            source={{ html: leafletHTML }}
            style={styles.map}
            originWhitelist={['*']}
            domStorageEnabled
            javaScriptEnabled
            onMessage={handleWebViewMessage}
            onLoadEnd={() => {
              // Inject initial markers once webview completes load
              if (activeLocations.length > 0) {
                const locationsData = activeLocations.map(loc => ({
                  user_id: loc.user_id,
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  profiles: { display_name: loc.profiles?.display_name }
                }));
                const js = `
                  if (typeof window.updateMarkers === 'function') {
                    window.updateMarkers('${JSON.stringify(locationsData).replace(/'/g, "\\'")}', '${selectedUserLocation?.user_id || ''}');
                  }
                  true;
                `;
                webviewRef.current?.injectJavaScript(js);
              }
            }}
          />

          {/* Active Banner overlay on top of map */}
          {selectedUserLocation && (
            <View style={styles.mapOverlayCard}>
              <View style={styles.overlayRow}>
                <Ionicons name="ellipse" size={8} color="#f5474c" style={{ marginRight: 6 }} />
                <Text style={styles.overlayUser}>{selectedUserLocation.profiles?.display_name}</Text>
              </View>
              <Text style={styles.overlayTime}>Last Active: {formatTime(selectedUserLocation.updated_at)}</Text>
              <Text style={styles.overlayCoords}>
                Coords: {selectedUserLocation.latitude.toFixed(5)}, {selectedUserLocation.longitude.toFixed(5)}
              </Text>
            </View>
          )}
        </View>

        {/* ACTIVE WORKER FEED LIST CARD PANEL */}
        <View style={styles.feedPanel}>
          <Text style={styles.feedHeader}>Live Worker Feed</Text>
          {activeLocations.length === 0 ? (
            <View style={styles.emptyFeed}>
              <Ionicons name="cloud-offline" size={32} color="#CBD5E0" />
              <Text style={styles.emptyFeedText}>No active shifts tracked.</Text>
              <Text style={styles.emptyFeedSub}>Workers show here when they click 'Start Your Day'.</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {activeLocations.map((loc) => {
                const isSelected = loc.user_id === selectedUserLocation?.user_id;
                return (
                  <TouchableOpacity
                    key={loc.user_id}
                    style={[styles.feedCard, isSelected && styles.feedCardSelected]}
                    onPress={() => handleSelectUser(loc)}
                  >
                    <View style={styles.feedCardHeader}>
                      <View style={[styles.statusIcon, isSelected && styles.statusIconSelected]} />
                      <Text style={styles.feedName}>{loc.profiles?.display_name || 'Worker'}</Text>
                    </View>
                    <Text style={styles.feedTime}>Ping: {formatTime(loc.updated_at)}</Text>
                    <Text style={styles.feedLoc}>
                      {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  loadingText: {
    fontSize: 14,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    marginTop: 12,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    marginTop: 2,
  },
  refreshBtn: {
    padding: 8,
    backgroundColor: '#FFEAEA',
    borderRadius: 12,
  },
  contentGrid: {
    flex: 1,
    flexDirection: 'column',
  },
  mapContainer: {
    flex: 1,
    height: height * 0.45,
    position: 'relative',
    backgroundColor: '#E2E8F0',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlayCard: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'rgba(27, 20, 100, 0.95)', // Wavy deep Indigo transparent
    borderRadius: 16,
    padding: 14,
    width: 220,
    elevation: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      web: {
        boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  overlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  overlayUser: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
    fontFamily: 'Poppins_700Bold',
  },
  overlayTime: {
    fontSize: 11,
    color: '#FFF',
    fontFamily: 'Roboto_400Regular',
  },
  overlayCoords: {
    fontSize: 10,
    color: '#A0AEC0',
    fontFamily: 'Roboto_400Regular',
    marginTop: 4,
  },
  feedPanel: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 20,
    maxHeight: height * 0.45,
  },
  feedHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b1464',
    marginBottom: 14,
    fontFamily: 'Poppins_700Bold',
  },
  emptyFeed: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyFeedText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#718096',
    fontFamily: 'Poppins_600SemiBold',
    marginTop: 10,
  },
  emptyFeedSub: {
    fontSize: 11,
    color: '#A0AEC0',
    fontFamily: 'Roboto_400Regular',
    textAlign: 'center',
    marginTop: 4,
  },
  feedCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  feedCardSelected: {
    borderColor: '#f5474c',
    backgroundColor: '#FFEAEA',
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusIcon: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A0AEC0',
    marginRight: 8,
  },
  statusIconSelected: {
    backgroundColor: '#f5474c',
  },
  feedName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  feedTime: {
    fontSize: 11,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
  },
  feedLoc: {
    fontSize: 10,
    color: '#A0AEC0',
    fontFamily: 'Roboto_400Regular',
    marginTop: 2,
  },
});
