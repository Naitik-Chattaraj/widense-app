import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabaseService, UserLocation } from '../services/supabaseService';

interface AdminMapScreenProps {
  user: any;
}

export default function AdminMapScreen({ user }: AdminMapScreenProps) {
  const [activeLocations, setActiveLocations] = useState<UserLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedUserLocation, setSelectedUserLocation] = useState<UserLocation | null>(null);

  const loadLocations = async () => {
    try {
      const locs = await supabaseService.getActiveLocations();
      setActiveLocations(locs);
      if (locs.length > 0 && !selectedUserLocation) {
        setSelectedUserLocation(locs[0]);
      }
    } catch (err) {
      console.error('[AdminMapWeb] Error loading locations:', err);
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

  // Embedded map url for active selected user on Web
  const webMapUrl = selectedUserLocation
    ? `https://maps.google.com/maps?q=${selectedUserLocation.latitude},${selectedUserLocation.longitude}&t=&z=15&ie=UTF8&iwloc=&output=embed`
    : `https://maps.google.com/maps?q=22.5134,88.4012&t=&z=12&ie=UTF8&iwloc=&output=embed`; // Kolkata default fallback

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
          <Text style={styles.headerTitle}>Live Crew Tracker (Web)</Text>
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
          <iframe
            src={webMapUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 0,
            }}
            allowFullScreen
            loading="lazy"
            title="Live Crew Tracker Map"
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
                    onPress={() => setSelectedUserLocation(loc)}
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
    flexDirection: 'row',
  },
  mapContainer: {
    flex: 2,
    height: 'auto',
    position: 'relative',
    backgroundColor: '#E2E8F0',
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
  },
  mapOverlayCard: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'rgba(27, 20, 100, 0.95)',
    borderRadius: 16,
    padding: 14,
    width: 220,
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)',
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
    maxHeight: 'auto',
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
