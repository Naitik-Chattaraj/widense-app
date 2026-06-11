import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Platform,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabaseService, Profile, Project, UserDay, MediaCapture } from '../services/supabaseService';
import LocationPickerModal from '../components/LocationPickerModal';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

const { width } = Dimensions.get('window');

interface AdminHomeScreenProps {
  user: any;
}

export default function AdminHomeScreen({ user }: AdminHomeScreenProps) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [logs, setLogs] = useState<UserDay[]>([]);
  const [mediaCaptures, setMediaCaptures] = useState<MediaCapture[]>([]);
  
  // Project Form States
  const [projectName, setProjectName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const getLocalDateString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [day, setDay] = useState(() => getLocalDateString(new Date())); // defaults to today YYYY-MM-DD
  const [assignedTo, setAssignedTo] = useState('');
  const [requireMedia, setRequireMedia] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Tab control inside admin home
  const [activeTab, setActiveTab] = useState<'assign' | 'logs' | 'media'>('assign');

  // UI state for Nominatim location suggestions, map picker, and Worker dropdown
  const [showWorkerDropdown, setShowWorkerDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const searchLocations = async (query: string) => {
    setLocationName(query);
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    setSearchingLocation(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`,
        {
          headers: {
            'User-Agent': 'WidenseApp/1.0 (support@widense.com)',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        }
      );
      if (!response.ok) {
        throw new Error(`Nominatim HTTP error: ${response.status}`);
      }
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        setSuggestions(data || []);
      } catch (parseErr) {
        throw new Error('Nominatim returned non-JSON response (likely rate limited)');
      }
    } catch (err) {
      console.error('[Nominatim API] Error fetching suggestions:', err);
    } finally {
      setSearchingLocation(false);
    }
  };

  const handleSelectLocation = (item: any) => {
    setLocationName(item.display_name);
    setLatitude(item.lat);
    setLongitude(item.lon);
    setTimeout(() => {
      setSuggestions([]);
    }, 50);
  };

  const handleMapPickerConfirm = (lat: number, lng: number, displayName: string) => {
    setLatitude(lat.toString());
    setLongitude(lng.toString());
    if (displayName) setLocationName(displayName);
  };

  // Load initial database records
  const loadData = async () => {
    setLoading(true);
    try {
      const allUsers = await supabaseService.getAllUsers();
      // Filter out admins from the project assignment list
      const workers = allUsers.filter(u => !u.admin);
      setUsers(workers);
      if (workers.length > 0) {
        setAssignedTo(workers[0].id);
      }

      const shiftLogs = await supabaseService.getUserDaysHistory();
      setLogs(shiftLogs);

      const captures = await supabaseService.getMediaCaptures();
      setMediaCaptures(captures);
    } catch (err) {
      console.error('[AdminHome] Error loading database data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProject = async () => {
    if (!projectName.trim() || !locationName.trim() || !latitude.trim() || !longitude.trim()) {
      Alert.alert('Missing Fields', 'Please fill out all project coordinates and details.');
      return;
    }

    const latVal = parseFloat(latitude);
    const lngVal = parseFloat(longitude);

    if (isNaN(latVal) || isNaN(lngVal)) {
      Alert.alert('Invalid Coordinates', 'Latitude and Longitude must be valid numbers.');
      return;
    }

    setSubmitting(true);
    try {
      const newProj = await supabaseService.createProject({
        name: projectName.trim(),
        location_name: locationName.trim(),
        latitude: latVal,
        longitude: lngVal,
        day,
        assigned_to: assignedTo || null,
        require_media: requireMedia
      });

      if (newProj) {
        Alert.alert('Success', 'Project created and assigned successfully.');
        setProjectName('');
        setLocationName('');
        setLatitude('');
        setLongitude('');
        loadData(); // reload history
      } else {
        Alert.alert('Error', 'Could not save project to Supabase.');
      }
    } catch (err) {
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadMedia = async (capture: MediaCapture) => {
    const projectName = capture.projects?.name || 'Project';
    const workerName = capture.profiles?.display_name || 'Worker';
    const cleanProjName = projectName.replace(/[^a-zA-Z0-9]/g, '_');
    
    // Naming pattern: ProjectName_Timestamp_report
    const dateFormatted = new Date(capture.captured_at).toISOString().split('T')[0];
    const fileName = `${cleanProjName}_${dateFormatted}_report`;
    
    if (Platform.OS === 'web') {
      try {
        // Load image, apply canvas watermark and download
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.src = capture.file_url;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            
            // Draw watermark banner
            const fontSize = Math.max(16, Math.floor(img.width / 40));
            ctx.font = `bold ${fontSize}px sans-serif`;
            
            const text = `${projectName} - Uploaded by ${workerName} - ${new Date(capture.captured_at).toLocaleString()} - Widense`;
            const textWidth = ctx.measureText(text).width;
            
            ctx.fillStyle = 'rgba(27, 20, 100, 0.7)'; // Indigo translucent
            ctx.fillRect(15, img.height - fontSize - 25, textWidth + 30, fontSize + 15);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(text, 30, img.height - 20);
          }
          
          const dataUrl = canvas.toDataURL(capture.media_type === 'video' ? 'video/mp4' : 'image/jpeg');
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = `${fileName}.${capture.media_type === 'video' ? 'mp4' : 'jpg'}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          Alert.alert('Download Started', 'Media saved to local storage with watermark.');
        };
        img.onerror = () => {
          // Fallback: download directly
          const link = document.createElement('a');
          link.href = capture.file_url;
          link.download = `${fileName}.${capture.media_type === 'video' ? 'mp4' : 'jpg'}`;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        };
      } catch (err) {
        console.error('Failed to watermark download web:', err);
      }
    } else {
      // Native Mobile download
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Media library access is required to save photos.');
          return;
        }
        
        Alert.alert('Downloading...', 'Fetching report media from server...');
        
        const extension = capture.media_type === 'video' ? 'mp4' : 'jpg';
        const fileUri = `${FileSystem.cacheDirectory}${fileName}.${extension}`;
        
        const downloadRes = await FileSystem.downloadAsync(capture.file_url, fileUri);
        const asset = await MediaLibrary.createAssetAsync(downloadRes.uri);
        const album = await MediaLibrary.getAlbumAsync('widense');
        
        if (album) {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        } else {
          await MediaLibrary.createAlbumAsync('widense', asset, false);
        }
        
        Alert.alert('Saved successfully!', `Report saved to your Gallery album "widense" as ${fileName}.${extension}`);
      } catch (err) {
        console.error('Failed to download native:', err);
        Alert.alert('Download Failed', 'Could not save file to device storage.');
      }
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'Active Shift';
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const mins = Math.floor(diff / (1000 * 60));
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return hrs > 0 ? `${hrs}h ${remMins}m` : `${remMins} mins`;
  };

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
        <Text style={styles.brandText}>
          Widense<Text style={{ color: '#f5474c' }}>.</Text>
          <Text style={styles.adminLabel}> ADMIN</Text>
        </Text>
        <TouchableOpacity style={styles.syncBtn} onPress={loadData}>
          <Ionicons name="refresh-circle-outline" size={26} color="#f5474c" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'assign' && styles.tabButtonActive]}
          onPress={() => setActiveTab('assign')}
        >
          <Text style={[styles.tabText, activeTab === 'assign' && styles.tabTextActive]}>
            Assign Projects
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'logs' && styles.tabButtonActive]}
          onPress={() => setActiveTab('logs')}
        >
          <Text style={[styles.tabText, activeTab === 'logs' && styles.tabTextActive]}>
            User Shifts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'media' && styles.tabButtonActive]}
          onPress={() => setActiveTab('media')}
        >
          <Text style={[styles.tabText, activeTab === 'media' && styles.tabTextActive]}>
            Media Reports
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'assign' ? (
          // CREATE & ASSIGN PROJECTS TAB
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Project Assignment</Text>
            
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Project / Site Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Solar Site A - Installation"
                placeholderTextColor="#A0AEC0"
                value={projectName}
                onChangeText={setProjectName}
              />
            </View>

            <View style={[styles.inputWrapper, { zIndex: 20 }]}>
              <Text style={styles.inputLabel}>Site Address / Location</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[styles.input, { flex: 1, paddingRight: 40 }]}
                  placeholder="Search address (e.g. Burdwan, Kolkata)..."
                  placeholderTextColor="#A0AEC0"
                  value={locationName}
                  onChangeText={searchLocations}
                />
                {searchingLocation && (
                  <ActivityIndicator
                    size="small"
                    color="#f5474c"
                    style={{ position: 'absolute', right: 12 }}
                  />
                )}
              </View>
              {suggestions.length > 0 && (
                <View style={styles.suggestionOverlay}>
                  {suggestions.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.suggestionItem}
                      onPress={() => handleSelectLocation(item)}
                    >
                      <Ionicons name="location-outline" size={16} color="#f5474c" style={{ marginRight: 8, marginTop: 2 }} />
                      <Text style={styles.suggestionText} numberOfLines={2}>
                        {item.display_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Map Picker — replaces manual lat/lon fields */}
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Site Coordinates</Text>
              <TouchableOpacity
                style={styles.mapPickerBtn}
                onPress={() => setShowMapPicker(true)}
                activeOpacity={0.82}
              >
                <View style={styles.mapPickerIconWrap}>
                  <Ionicons name="map" size={22} color="#f5474c" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  {latitude && longitude ? (
                    <>
                      <Text style={styles.mapPickerCoordsText}>
                        {parseFloat(latitude).toFixed(5)},  {parseFloat(longitude).toFixed(5)}
                      </Text>
                      <Text style={styles.mapPickerSubText}>Tap to change location on map</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.mapPickerPlaceholder}>Pick location on map</Text>
                      <Text style={styles.mapPickerSubText}>Uses OpenStreetMap — 100% free</Text>
                    </>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#CBD5E0" />
              </TouchableOpacity>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputWrapper, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>Project Date</Text>
                <View style={styles.dateSelectorRow}>
                  <TouchableOpacity
                    style={styles.dateSelectorArrow}
                    onPress={() => {
                      const d = new Date(day);
                      d.setDate(d.getDate() - 1);
                      setDay(getLocalDateString(d));
                    }}
                  >
                    <Ionicons name="chevron-back" size={18} color="#1b1464" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dateSelectorCenter}
                    onPress={() => setDay(getLocalDateString(new Date()))}
                  >
                    <Text style={styles.dateSelectorDayName}>
                      {new Date(day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                    </Text>
                    <Text style={styles.dateSelectorDate}>
                      {new Date(day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                    <Text style={styles.dateSelectorYear}>
                      {new Date(day + 'T00:00:00').getFullYear()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dateSelectorArrow}
                    onPress={() => {
                      const d = new Date(day);
                      d.setDate(d.getDate() + 1);
                      setDay(getLocalDateString(d));
                    }}
                  >
                    <Ionicons name="chevron-forward" size={18} color="#1b1464" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.inputWrapper, { flex: 1, zIndex: 10 }]}>
                <Text style={styles.inputLabel}>Assign Worker</Text>
                <View style={styles.selectWrapper}>
                  {users.length > 0 ? (
                    <View style={{ zIndex: 50 }}>
                      <TouchableOpacity
                        style={[styles.input, styles.dropdownTrigger]}
                        onPress={() => setShowWorkerDropdown(!showWorkerDropdown)}
                      >
                        <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                          {users.find(u => u.id === assignedTo)?.display_name || 'Select Worker'}
                        </Text>
                        <Ionicons
                          name={showWorkerDropdown ? "chevron-up" : "chevron-down"}
                          size={18}
                          color="#1b1464"
                        />
                      </TouchableOpacity>

                      {showWorkerDropdown && (
                        <View style={styles.workerDropdownList}>
                          <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                            {users.map((worker) => (
                              <TouchableOpacity
                                key={worker.id}
                                style={[
                                  styles.workerDropdownItem,
                                  assignedTo === worker.id && styles.workerDropdownItemActive
                                ]}
                                onPress={() => {
                                  setAssignedTo(worker.id);
                                  setTimeout(() => {
                                    setShowWorkerDropdown(false);
                                  }, 50);
                                }}
                              >
                                <View style={styles.workerDropdownAvatar}>
                                  {worker.avatar_url ? (
                                    <Image source={{ uri: worker.avatar_url }} style={styles.workerDropdownAvatarImage} />
                                  ) : (
                                    <Text style={styles.workerDropdownAvatarTxt}>
                                      {(worker.display_name || 'W')[0].toUpperCase()}
                                    </Text>
                                  )}
                                </View>
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                  <Text style={styles.workerDropdownName} numberOfLines={1}>
                                    {worker.display_name}
                                  </Text>
                                  <Text style={styles.workerDropdownEmail} numberOfLines={1}>
                                    {worker.email}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 14, color: '#666', fontFamily: 'Roboto_400Regular' }}>No workers registered</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Requires Media switch */}
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchTitle}>Require Media Check-in</Text>
                <Text style={styles.switchSubtitle}>Stamps logo + location on photos/videos</Text>
              </View>
              <Switch
                value={requireMedia}
                onValueChange={setRequireMedia}
                trackColor={{ false: '#CBD5E0', true: '#FFD1D2' }}
                thumbColor={requireMedia ? '#f5474c' : '#F3F4F6'}
              />
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleCreateProject}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkbox-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>Assign Project</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* LocationPickerModal — OpenStreetMap powered */}
        <LocationPickerModal
          visible={showMapPicker}
          initialLatitude={latitude ? parseFloat(latitude) : undefined}
          initialLongitude={longitude ? parseFloat(longitude) : undefined}
          useCurrentLocation={!latitude && !longitude}
          onConfirm={handleMapPickerConfirm}
          onClose={() => setShowMapPicker(false)}
        />

        {activeTab === 'logs' ? (
          // USER SHIFTS LOGS TAB
          <View style={styles.logsContainer}>
            <Text style={styles.sectionHeader}>Worker Shift History</Text>
            {logs.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={48} color="#CBD5E0" />
                <Text style={styles.emptyText}>No shift logs recorded yet.</Text>
              </View>
            ) : (
              logs.map((log) => (
                <View key={log.id} style={styles.logCard}>
                  {/* Log Header */}
                  <View style={styles.logHeader}>
                    <View style={styles.avatar}>
                      {log.profiles?.avatar_url ? (
                        <Image source={{ uri: log.profiles.avatar_url }} style={styles.avatarImage} />
                      ) : (
                        <Text style={styles.avatarText}>
                          {(log.profiles?.display_name || 'W')[0].toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.workerInfo}>
                      <Text style={styles.workerName}>{log.profiles?.display_name || 'Worker'}</Text>
                      <Text style={styles.logDate}>{new Date(log.day).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
                    </View>
                    <View style={[styles.statusBadge, log.ended_at ? styles.statusBadgeDone : styles.statusBadgeActive]}>
                      <Text style={[styles.statusBadgeText, log.ended_at ? styles.statusBadgeTextDone : styles.statusBadgeTextActive]}>
                        {log.ended_at ? 'Completed' : 'Active'}
                      </Text>
                    </View>
                  </View>

                  {/* Log Metrics */}
                  <View style={styles.logMetricsGrid}>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>CLOCK IN</Text>
                      <Text style={styles.metricValue}>{formatTime(log.started_at)}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>CLOCK OUT</Text>
                      <Text style={styles.metricValue}>{formatTime(log.ended_at)}</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>DISTANCE</Text>
                      <Text style={[styles.metricValue, { color: '#f5474c' }]}>
                        {log.distance_km ? `${log.distance_km.toFixed(2)} km` : '0.00 km'}
                      </Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricLabel}>DURATION</Text>
                      <Text style={styles.metricValue}>{formatDuration(log.started_at, log.ended_at)}</Text>
                    </View>
                  </View>

                  {/* Route History Preview */}
                  {log.route_history && log.route_history.length > 0 && (
                    <View style={styles.routeHistoryContainer}>
                      <View style={styles.routeHeader}>
                        <Ionicons name="analytics" size={16} color="#f5474c" />
                        <Text style={styles.routeTitle}>Route Tracking Points ({log.route_history.length})</Text>
                      </View>
                      <View style={styles.routeTimeline}>
                        {log.route_history.slice(0, 3).map((pt, idx) => (
                           <Text key={idx} style={styles.routePt}>
                            • {formatTime(pt.timestamp)}: ({pt.latitude.toFixed(4)}, {pt.longitude.toFixed(4)})
                          </Text>
                        ))}
                        {log.route_history.length > 3 && (
                          <Text style={styles.routeMore}>+ {log.route_history.length - 3} more coordinates logged</Text>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        ) : null}

        {activeTab === 'media' ? (
          // FIELD MEDIA REPORTS TAB
          <View style={styles.logsContainer}>
            <Text style={styles.sectionHeader}>Worker Media Reports</Text>
            {mediaCaptures.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="images-outline" size={48} color="#CBD5E0" />
                <Text style={styles.emptyText}>No media reports uploaded yet.</Text>
              </View>
            ) : (
              mediaCaptures.map((capture) => (
                <View key={capture.id} style={styles.mediaReportCard}>
                  {/* Header: Project & Worker */}
                  <View style={styles.mediaReportHeader}>
                    <Ionicons name={capture.media_type === 'video' ? 'videocam' : 'image'} size={20} color="#f5474c" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.mediaReportProjName}>{capture.projects?.name || 'Project'}</Text>
                      <Text style={styles.mediaReportWorker}>By: {capture.profiles?.display_name || 'Worker'}</Text>
                    </View>
                    <Text style={styles.mediaReportTime}>
                      {new Date(capture.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>

                  {/* Thumbnail / Preview with watermark visual overlay */}
                  <View style={styles.mediaPreviewContainer}>
                    {capture.media_type === 'video' ? (
                      <View style={styles.videoPlaceholder}>
                        <Ionicons name="play-circle" size={48} color="#FFF" />
                        <Text style={styles.videoPlaceholderText}>Video Report (Tap to download/play)</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: capture.file_url }} style={styles.mediaPreviewImage} resizeMode="cover" />
                    )}
                    
                    {/* Visual Watermark Overlay */}
                    <View style={styles.watermarkOverlay}>
                      <Text style={styles.watermarkText}>
                        {capture.projects?.name} • {capture.profiles?.display_name} • {new Date(capture.captured_at).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>

                  {/* Download Action */}
                  <TouchableOpacity
                    style={styles.downloadButton}
                    onPress={() => downloadMedia(capture)}
                  >
                    <Ionicons name="cloud-download-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.downloadButtonText}>Save to Device (Watermarked)</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
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
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  brandText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1b1464',
    letterSpacing: 0.5,
    fontFamily: 'Poppins_700Bold',
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminLabel: {
    fontSize: 10,
    color: '#FFF',
    backgroundColor: '#1b1464',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
    overflow: 'hidden',
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  syncBtn: {
    padding: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    marginHorizontal: 24,
    marginTop: 18,
    borderRadius: 16,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: '#FFF',
    elevation: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      web: {
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
      },
    }),
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#718096',
    fontFamily: 'Poppins_600SemiBold',
  },
  tabTextActive: {
    color: '#1b1464',
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 110, // accounts for absolute bottom tab navigator height
  },
  formCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    elevation: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.04,
        shadowRadius: 16,
      },
      web: {
        boxShadow: '0px 8px 16px rgba(27, 20, 100, 0.04)',
      },
    }),
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b1464',
    marginBottom: 20,
    fontFamily: 'Poppins_700Bold',
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 11,
    color: '#f5474c', // Coral Red labels
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A202C',
    fontFamily: 'Roboto_400Regular',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  selectWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  dateSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  dateSelectorArrow: {
    width: 36,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  dateSelectorCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  dateSelectorDayName: {
    fontSize: 9,
    color: '#f5474c',
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  dateSelectorDate: {
    fontSize: 14,
    color: '#1b1464',
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  dateSelectorYear: {
    fontSize: 10,
    color: '#A0AEC0',
    fontFamily: 'Roboto_400Regular',
    marginTop: 1,
  },
  mapPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  mapPickerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFEAEA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPickerCoordsText: {
    fontSize: 14,
    color: '#1b1464',
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  mapPickerPlaceholder: {
    fontSize: 14,
    color: '#A0AEC0',
    fontFamily: 'Roboto_400Regular',
  },
  mapPickerSubText: {
    fontSize: 11,
    color: '#A0AEC0',
    fontFamily: 'Roboto_400Regular',
    marginTop: 2,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    marginVertical: 12,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1b1464',
    fontFamily: 'Poppins_600SemiBold',
  },
  switchSubtitle: {
    fontSize: 11,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    marginTop: 2,
  },
  submitBtn: {
    backgroundColor: '#f5474c', // Premium Coral Red button
    borderRadius: 16,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
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
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
  },
  logsContainer: {
    gap: 16,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b1464',
    marginBottom: 8,
    fontFamily: 'Poppins_700Bold',
  },
  emptyCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 14,
    color: '#A0AEC0',
    fontFamily: 'Roboto_400Regular',
    marginTop: 12,
  },
  logCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    elevation: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
      },
      web: {
        boxShadow: '0px 4px 10px rgba(27, 20, 100, 0.03)',
      },
    }),
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    paddingBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFEAEA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f5474c',
    fontFamily: 'Poppins_700Bold',
  },
  workerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  workerName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  logDate: {
    fontSize: 11,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeActive: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeDone: {
    backgroundColor: '#FFEAEA',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  statusBadgeTextActive: {
    color: '#D97706',
  },
  statusBadgeTextDone: {
    color: '#f5474c',
  },
  logMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    gap: 12,
  },
  metricItem: {
    width: '47%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  metricLabel: {
    fontSize: 9,
    color: '#A0AEC0',
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D3748',
    fontFamily: 'Poppins_700Bold',
    marginTop: 4,
  },
  routeHistoryContainer: {
    marginTop: 16,
    backgroundColor: '#FAF5FF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EBF4FF',
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  routeTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
    marginLeft: 6,
  },
  routeTimeline: {
    gap: 4,
  },
  routePt: {
    fontSize: 11,
    color: '#4A5568',
    fontFamily: 'Roboto_400Regular',
  },
  routeMore: {
    fontSize: 10,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    fontStyle: 'italic',
    marginTop: 2,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownTriggerText: {
    fontSize: 14,
    color: '#1A202C',
    fontFamily: 'Roboto_400Regular',
  },
  workerDropdownList: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    zIndex: 999,
    elevation: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      web: {
        boxShadow: '0px 8px 12px rgba(27, 20, 100, 0.1)',
      },
    }),
  },
  workerDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  workerDropdownItemActive: {
    backgroundColor: '#FFF5F5',
  },
  workerDropdownAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFEAEA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  workerDropdownAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  workerDropdownAvatarTxt: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#f5474c',
    fontFamily: 'Poppins_700Bold',
  },
  workerDropdownName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  workerDropdownEmail: {
    fontSize: 11,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
  },
  suggestionOverlay: {
    position: 'absolute',
    top: 68,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    zIndex: 999,
    elevation: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      web: {
        boxShadow: '0px 8px 12px rgba(27, 20, 100, 0.1)',
      },
    }),
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionText: {
    fontSize: 13,
    color: '#2D3748',
    fontFamily: 'Roboto_400Regular',
    flex: 1,
  },
  mediaReportCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
      },
      web: {
        boxShadow: '0px 4px 10px rgba(27, 20, 100, 0.03)',
      },
    }),
  },
  mediaReportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  mediaReportProjName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  mediaReportWorker: {
    fontSize: 12,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    marginTop: 1,
  },
  mediaReportTime: {
    fontSize: 11,
    color: '#A0AEC0',
    fontFamily: 'Roboto_400Regular',
  },
  mediaPreviewContainer: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1A202C',
    marginBottom: 14,
  },
  mediaPreviewImage: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2D3748',
  },
  videoPlaceholderText: {
    color: '#FFF',
    fontSize: 12,
    marginTop: 8,
    fontFamily: 'Roboto_400Regular',
  },
  watermarkOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(27, 20, 100, 0.65)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  watermarkText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
  downloadButton: {
    backgroundColor: '#f5474c',
    borderRadius: 14,
    height: 44,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
  }
});
