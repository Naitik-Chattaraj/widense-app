import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

const { width, height } = Dimensions.get('window');

interface LocationPickerModalProps {
  visible: boolean;
  initialLatitude?: number;
  initialLongitude?: number;
  useCurrentLocation?: boolean;
  onConfirm: (lat: number, lng: number, displayName: string) => void;
  onClose: () => void;
}

const FALLBACK_LAT = 20.5937; // India center
const FALLBACK_LNG = 78.9629;

export default function LocationPickerModal({
  visible,
  initialLatitude,
  initialLongitude,
  useCurrentLocation = false,
  onConfirm,
  onClose,
}: LocationPickerModalProps) {
  const [pickedLat, setPickedLat] = useState(initialLatitude ?? FALLBACK_LAT);
  const [pickedLng, setPickedLng] = useState(initialLongitude ?? FALLBACK_LNG);
  const [reverseGeoName, setReverseGeoName] = useState('');
  const [loadingReverse, setLoadingReverse] = useState(false);
  const [locating, setLocating] = useState(false);
  const webviewRef = useRef<WebView>(null);

  // Memoize the HTML template to prevent the WebView from reloading every timePickedLat changes
  const leafletHTML = React.useMemo(() => {
    const initLat = initialLatitude ?? FALLBACK_LAT;
    const initLng = initialLongitude ?? FALLBACK_LNG;

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
          var initLat = ${initLat};
          var initLng = ${initLng};

          var map = L.map('map', { zoomControl: true }).setView([initLat, initLng], 14);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          }).addTo(map);

          var redIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41],
          });

          var marker = L.marker([initLat, initLng], { draggable: true, icon: redIcon }).addTo(map);

          function emitCoords(lat, lng) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOCATION_PICKED', lat: lat, lng: lng }));
            }
          }

          marker.on('dragend', function(e) {
            var ll = e.target.getLatLng();
            emitCoords(ll.lat, ll.lng);
          });

          map.on('click', function(e) {
            marker.setLatLng(e.latlng);
            emitCoords(e.latlng.lat, e.latlng.lng);
          });
        </script>
      </body>
      </html>
    `;
  }, [visible]);

  // On open: if useCurrentLocation, try to get device GPS
  useEffect(() => {
    if (!visible) return;
    if (!useCurrentLocation) {
      // If explicit coords provided, reverse-geocode them on open
      if (initialLatitude != null && initialLongitude != null) {
        setPickedLat(initialLatitude);
        setPickedLng(initialLongitude);
        reverseGeocode(initialLatitude, initialLongitude);
      }
      return;
    }
    
    const fetchLocation = async () => {
      setLocating(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          // Permission denied — stay on fallback
          setLocating(false);
          return;
        }

        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const { latitude, longitude } = pos.coords;
        setPickedLat(latitude);
        setPickedLng(longitude);
        reverseGeocode(latitude, longitude);

        // Inject JS to update the map view dynamically
        const js = `
          if (typeof marker !== 'undefined' && typeof map !== 'undefined') {
            marker.setLatLng([${latitude}, ${longitude}]);
            map.setView([${latitude}, ${longitude}], 14);
          }
          true;
        `;
        webviewRef.current?.injectJavaScript(js);
      } catch (err) {
        console.error('Location error:', err);
      } finally {
        setLocating(false);
      }
    };

    fetchLocation();
  }, [visible]);

  const reverseGeocode = async (lat: number, lng: number) => {
    setLoadingReverse(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        {
          headers: {
            'User-Agent': 'WidenseApp/1.0 (support@widense.com)',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        }
      );
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const text = await resp.text();
      const data = JSON.parse(text);
      setReverseGeoName(data?.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } catch {
      setReverseGeoName(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } finally {
      setLoadingReverse(false);
    }
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'LOCATION_PICKED') {
        const lat = parseFloat(msg.lat);
        const lng = parseFloat(msg.lng);
        setPickedLat(lat);
        setPickedLng(lng);
        reverseGeocode(lat, lng);
      }
    } catch (e) {
      console.error('WebView message parsing error:', e);
    }
  };

  const handleConfirm = () => {
    onConfirm(pickedLat, pickedLng, reverseGeoName || `${pickedLat.toFixed(5)}, ${pickedLng.toFixed(5)}`);
    onClose();
  };

  const isLoading = loadingReverse || locating;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#1b1464" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pick Site Location</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Hint */}
        <View style={styles.hintBanner}>
          {locating ? (
            <>
              <ActivityIndicator size="small" color="#f5474c" style={{ marginRight: 8 }} />
              <Text style={styles.hintText}>Getting your current location...</Text>
            </>
          ) : (
            <>
              <Ionicons name="finger-print-outline" size={15} color="#f5474c" />
              <Text style={styles.hintText}>Tap anywhere on the map to place the site pin</Text>
            </>
          )}
        </View>

        {/* Map WebView */}
        <WebView
          ref={webviewRef}
          source={{ html: leafletHTML }}
          style={styles.map}
          originWhitelist={['*']}
          domStorageEnabled
          javaScriptEnabled
          onMessage={handleWebViewMessage}
        />

        {/* Bottom Card */}
        <View style={styles.bottomCard}>
          <View style={styles.coordRow}>
            <View style={styles.coordBadge}>
              <Text style={styles.coordLabel}>LAT</Text>
              <Text style={styles.coordValue}>{pickedLat.toFixed(6)}</Text>
            </View>
            <View style={styles.coordDivider} />
            <View style={styles.coordBadge}>
              <Text style={styles.coordLabel}>LNG</Text>
              <Text style={styles.coordValue}>{pickedLng.toFixed(6)}</Text>
            </View>
          </View>

          {loadingReverse ? (
            <ActivityIndicator size="small" color="#f5474c" style={{ marginVertical: 8 }} />
          ) : (
            <Text style={styles.geoName} numberOfLines={2}>
              <Ionicons name="location" size={12} color="#718096" />{' '}
              {reverseGeoName || (locating ? 'Locating...' : 'Tap the map to pick a location')}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.confirmBtn, isLoading && { opacity: 0.7 }]}
            onPress={handleConfirm}
            disabled={isLoading}
          >
            <Ionicons name="checkmark-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.confirmBtnText}>Confirm Location</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF5F5',
    gap: 8,
  },
  hintText: {
    fontSize: 12,
    color: '#f5474c',
    fontFamily: 'Roboto_400Regular',
    flex: 1,
  },
  map: {
    flex: 1,
    width: width,
  },
  bottomCard: {
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
    }),
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  coordBadge: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  coordDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E2E8F0',
  },
  coordLabel: {
    fontSize: 9,
    color: '#f5474c',
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1,
  },
  coordValue: {
    fontSize: 14,
    color: '#1b1464',
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
    marginTop: 2,
  },
  geoName: {
    fontSize: 12,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    marginBottom: 14,
    lineHeight: 18,
  },
  confirmBtn: {
    backgroundColor: '#f5474c',
    borderRadius: 16,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#f5474c',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
  },
});
