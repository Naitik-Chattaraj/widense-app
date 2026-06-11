import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface LocationPickerModalProps {
  visible: boolean;
  initialLatitude?: number;
  initialLongitude?: number;
  useCurrentLocation?: boolean;
  onConfirm: (lat: number, lng: number, displayName: string) => void;
  onClose: () => void;
}

const FALLBACK_LAT = 20.5937; // India centre
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
  const iframeRef = useRef<any>(null);

  // Build the Leaflet HTML — fully self-contained, uses CDN
  const initLat = initialLatitude ?? FALLBACK_LAT;
  const initLng = initialLongitude ?? FALLBACK_LNG;
  const leafletHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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

    // Custom red pin icon
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
      window.parent.postMessage(JSON.stringify({ type: 'LOCATION_PICKED', lat: lat, lng: lng }), '*');
    }

    marker.on('dragend', function(e) {
      var ll = e.target.getLatLng();
      emitCoords(ll.lat, ll.lng);
    });

    map.on('click', function(e) {
      marker.setLatLng(e.latlng);
      emitCoords(e.latlng.lat, e.latlng.lng);
    });

    // Allow parent to update marker via postMessage
    window.addEventListener('message', function(ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'SET_LOCATION') {
          marker.setLatLng([msg.lat, msg.lng]);
          map.setView([msg.lat, msg.lng], 14);
        }
      } catch(e) {}
    });
  </script>
</body>
</html>`;

  // Listen for postMessages from the iframe + handle current location
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'LOCATION_PICKED') {
          const lat = parseFloat(msg.lat);
          const lng = parseFloat(msg.lng);
          setPickedLat(lat);
          setPickedLng(lng);
          reverseGeocode(lat, lng);
        }
      } catch {}
    };

    if (visible) {
      window.addEventListener('message', handler);

      // If we should use current GPS, ask the browser
      if (useCurrentLocation) {
        setLocating(true);
        navigator.geolocation?.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            setPickedLat(latitude);
            setPickedLng(longitude);
            reverseGeocode(latitude, longitude);
            // Pan the Leaflet map to the current position
            setTimeout(() => {
              moveMapToLocation(latitude, longitude);
            }, 800); // slight delay so iframe finishes loading
            setLocating(false);
          },
          () => { setLocating(false); },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else if (initialLatitude != null && initialLongitude != null) {
        setPickedLat(initialLatitude);
        setPickedLng(initialLongitude);
        reverseGeocode(initialLatitude, initialLongitude);
      }
    }

    return () => {
      window.removeEventListener('message', handler);
    };
  }, [visible]);

  // When a location search result is selected, move the map marker
  const moveMapToLocation = (lat: number, lng: number) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ type: 'SET_LOCATION', lat, lng }),
        '*'
      );
    }
  };

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

  const handleConfirm = () => {
    onConfirm(
      pickedLat,
      pickedLng,
      reverseGeoName || `${pickedLat.toFixed(5)}, ${pickedLng.toFixed(5)}`
    );
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#1b1464" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Pick Site Location</Text>
            <Text style={styles.headerSub}>Click anywhere on the map to pin</Text>
          </View>
          <View style={{ width: 38 }} />
        </View>

        {/* Leaflet Map iframe */}
        <View style={styles.mapContainer}>
          {/* @ts-ignore - iframe is valid on web */}
          <iframe
            ref={iframeRef}
            srcDoc={leafletHTML}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
            title="Location Picker Map"
            sandbox="allow-scripts allow-same-origin"
          />
        </View>

        {/* Bottom Panel */}
        <View style={styles.bottomCard}>
          <View style={styles.coordRow}>
            <View style={styles.coordBadge}>
              <Text style={styles.coordLabel}>LATITUDE</Text>
              <Text style={styles.coordValue}>{pickedLat.toFixed(6)}</Text>
            </View>
            <View style={styles.coordDivider} />
            <View style={styles.coordBadge}>
              <Text style={styles.coordLabel}>LONGITUDE</Text>
              <Text style={styles.coordValue}>{pickedLng.toFixed(6)}</Text>
            </View>
          </View>

          {locating ? (
            <View style={styles.geoRow}>
              <ActivityIndicator size="small" color="#f5474c" />
              <Text style={styles.geoLoadingText}>Getting your current location...</Text>
            </View>
          ) : loadingReverse ? (
            <View style={styles.geoRow}>
              <ActivityIndicator size="small" color="#f5474c" />
              <Text style={styles.geoLoadingText}>Resolving address...</Text>
            </View>
          ) : (
            <View style={styles.geoRow}>
              <Ionicons name="location-outline" size={14} color="#718096" style={{ marginRight: 6, marginTop: 1 }} />
              <Text style={styles.geoName} numberOfLines={2}>
                {reverseGeoName || 'Click the map to select a location'}
              </Text>
            </View>
          )}

          <View style={styles.footerActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, (loadingReverse || locating) && { opacity: 0.7 }]}
              onPress={handleConfirm}
              disabled={loadingReverse || locating}
            >
              <Ionicons name="checkmark-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.confirmBtnText}>Confirm Location</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    display: 'flex' as any,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  headerSub: {
    fontSize: 11,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    marginTop: 1,
  },
  mapContainer: {
    flex: 1,
    minHeight: 400,
  },
  bottomCard: {
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      web: {
        boxShadow: '0px -4px 12px rgba(27, 20, 100, 0.06)',
      },
    }),
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
    height: 44,
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
  geoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  geoName: {
    fontSize: 12,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    flex: 1,
    lineHeight: 18,
  },
  geoLoadingText: {
    fontSize: 12,
    color: '#A0AEC0',
    fontFamily: 'Roboto_400Regular',
    marginLeft: 8,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  cancelBtnText: {
    fontSize: 15,
    color: '#718096',
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: '#f5474c',
    borderRadius: 16,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0px 6px 10px rgba(245, 71, 76, 0.25)',
        cursor: 'pointer',
      },
    }),
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
  },
});
