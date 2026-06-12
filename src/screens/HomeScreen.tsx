import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { supabaseService, Project, UserDay } from '../services/supabaseService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
const { width } = Dimensions.get('window');
const wtLogo = require('../../assets/wt-logo.png');

interface HomeScreenProps {
  user: any;
  navigation: any;
}

export default function HomeScreen({ user, navigation }: HomeScreenProps) {
  const displayName = user?.name || 'Howard';
  
  // Dashboard states
  const [greeting, setGreeting] = useState('Good Morning');
  const [todayProjects, setTodayProjects] = useState<Project[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [activeShift, setActiveShift] = useState<UserDay | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  
  // Modal states
  const [selectProjModal, setSelectProjModal] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [loading, setLoading] = useState(true);

  // Tracking details
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{latitude: number, longitude: number, timestamp: string}>>([]);
  const trackingTimer = useRef<any>(null);

  // Calendar states
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarDays, setCalendarDays] = useState<Date[]>([]);
  
  // Watermarking WebView references for native platforms
  const watermarkWebviewRef = useRef<WebView>(null);
  const watermarkResolveRef = useRef<any>(null);

  const watermarkHTML = React.useMemo(() => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
      </head>
      <body>
        <script>
          window.watermarkImage = function(base64Str, projectName) {
            var img = new Image();
            img.onload = function() {
              var canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              var ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                
                // Draw watermark banner
                var fontSize = Math.max(20, Math.floor(img.width / 35));
                ctx.font = "bold " + fontSize + "px sans-serif";
                
                var timestamp = new Date().toLocaleString();
                var text = projectName + " - " + timestamp + " - Widense";
                var textWidth = ctx.measureText(text).width;
                
                ctx.fillStyle = 'rgba(27, 20, 100, 0.6)'; // Indigo translucent
                ctx.fillRect(15, img.height - fontSize - 25, textWidth + 30, fontSize + 15);
                
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(text, 30, img.height - 20);
              }
              
              var result = canvas.toDataURL('image/jpeg', 0.8);
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(result);
              }
            };
            img.onerror = function() {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(base64Str);
              }
            };
            img.src = base64Str;
          };
        </script>
      </body>
      </html>
    `;
  }, []);

  const handleWatermarkMessage = (event: any) => {
    const data = event.nativeEvent.data;
    if (watermarkResolveRef.current) {
      watermarkResolveRef.current(data);
      watermarkResolveRef.current = null;
    }
  };

  // 1. Time-aware greeting logic
  const updateGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      setGreeting('Good Morning');
    } else if (hour >= 12 && hour < 17) {
      setGreeting('Good Afternoon');
    } else if (hour >= 17 && hour < 21) {
      setGreeting('Good Evening');
    } else {
      setGreeting('Good Night');
    }
  };

  // Generate 7 days for horizontal mini calendar starting today
  const generateCalendarDays = () => {
    const days: Date[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    setCalendarDays(days);
  };

  // Load projects & current active day logs
  const loadDashboardData = async () => {
    setLoading(true);
    try {
      updateGreeting();
      generateCalendarDays();

      // Load today's shift log if any
      const shift = await supabaseService.getTodayUserDay(user.id);
      setActiveShift(shift);

      // Load all projects assigned to user
      const projs = await supabaseService.getProjects(user.id);
      setAllProjects(projs);

      // Filter today's projects based on today's day of week or calendar date matches
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayStr = weekdays[new Date().getDay()]; // e.g. "Monday"
      const dateStr = new Date().toISOString().split('T')[0]; // e.g. "2026-05-21"

      const todayProjs = projs.filter(
        (p) => p.day === todayStr || p.day === dateStr
      );
      setTodayProjects(todayProjs);

      // Restore active selected destination project if shift is active
      if (shift && !shift.ended_at) {
        const cachedProj = await AsyncStorage.getItem(`active_project_${user.id}`);
        if (cachedProj) {
          const parsed = JSON.parse(cachedProj);
          const fullProj = projs.find(p => p.id === parsed.id) || parsed;
          setActiveProject(fullProj);
          
          // Auto-arrive if project is active or completed in Supabase
          if (fullProj.status === 'active' || fullProj.status === 'completed') {
            setArrived(true);
          } else {
            setArrived(false);
          }
        } else if (todayProjs.length > 0) {
          const defaultProj = todayProjs.find(p => p.status !== 'completed');
          if (defaultProj) {
            setActiveProject(defaultProj);
            if (defaultProj.status === 'active' || defaultProj.status === 'completed') {
              setArrived(true);
            } else {
              setArrived(false);
            }
          }
        }
        
        // Start real live GPS tracking
        startLiveTracking();
      }
    } catch (e) {
      console.error('[WorkerHome] Error loading dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    return () => {
      if (trackingTimer.current) {
        clearInterval(trackingTimer.current);
      }
    };
  }, []);

  // Keep activeProject ref updated to prevent stale closures in watchPositionAsync
  const activeProjRef = useRef<Project | null>(null);
  useEffect(() => {
    activeProjRef.current = activeProject;
  }, [activeProject]);

  const getDistanceToProject = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(toRad(lat1)) * Math.cos(toRad(lat2));
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };

  // Auto-arrive check helper
  const checkArrivalStatus = async (lat: number, lng: number) => {
    const proj = activeProjRef.current;
    if (proj) {
      const dist = getDistanceToProject(lat, lng, proj.latitude, proj.longitude);
      if (dist <= 0.05) { // 50 meters
        setArrived(true);
        if (proj.status === 'pending') {
          const success = await supabaseService.updateProjectStatus(proj.id, 'active');
          if (success) {
            setActiveProject(prev => prev ? { ...prev, status: 'active' } : null);
            // Update AsyncStorage cache for consistency
            const cachedProj = await AsyncStorage.getItem(`active_project_${user.id}`);
            if (cachedProj) {
              const parsed = JSON.parse(cachedProj);
              parsed.status = 'active';
              await AsyncStorage.setItem(`active_project_${user.id}`, JSON.stringify(parsed));
            }
          }
        }
      }
    }
  };

// 2. Real Live GPS Tracking via expo-location
  const startLiveTracking = async () => {
    // Clear any existing subscription
    if (trackingTimer.current?.remove) {
      trackingTimer.current.remove();
    } else if (trackingTimer.current) {
      clearInterval(trackingTimer.current);
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please grant location permissions to track your shift routes.');
        return;
      }

      // Initial point
      const initialPos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setRouteCoordinates([{
        latitude: initialPos.coords.latitude,
        longitude: initialPos.coords.longitude,
        timestamp: new Date().toISOString()
      }]);
      await supabaseService.updateLiveLocation(user.id, initialPos.coords.latitude, initialPos.coords.longitude);
      await checkArrivalStatus(initialPos.coords.latitude, initialPos.coords.longitude);

      // Subscribe to live location updates
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000, // every 10 secs
          distanceInterval: 10, // or every 10 meters
        },
        async (location) => {
          const lat = location.coords.latitude;
          const lng = location.coords.longitude;
          const timestamp = new Date().toISOString();
          
          setRouteCoordinates(prev => [...prev, { latitude: lat, longitude: lng, timestamp }]);
          await supabaseService.updateLiveLocation(user.id, lat, lng);
          await checkArrivalStatus(lat, lng);
        }
      );
      
      trackingTimer.current = subscription;
    } catch (e) {
      console.warn('Failed to start live tracking:', e);
    }
  };

  // 3. Start Day trigger
  const handleStartDay = async () => {
    if (todayProjects.length === 0) {
      Alert.alert('No Projects Today', 'You have no assigned projects today. Start shift anyway?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Shift',
          onPress: async () => {
            const shift = await supabaseService.startUserDay(user.id);
            setActiveShift(shift);
            Alert.alert('Shift Started', 'You logged your clock-in timestamp.');
          }
        }
      ]);
      return;
    }

    if (todayProjects.length === 1) {
      // 1 project, auto start
      const selected = todayProjects[0];
      const shift = await supabaseService.startUserDay(user.id);
      if (shift) {
        setActiveShift(shift);
        setActiveProject(selected);
        await AsyncStorage.setItem(`active_project_${user.id}`, JSON.stringify(selected));
        startLiveTracking();
        Alert.alert('Shift Started', `Shift started. Directing to: ${selected.name}`);
        navigation.navigate('ActivitiesTab'); // auto redirect to full maps
      }
    } else {
      // Multiple projects, prompt modal selection
      setSelectProjModal(true);
    }
  };

  const handleSelectProjectAndStart = async (selected: Project) => {
    const shift = await supabaseService.startUserDay(user.id);
    if (shift) {
      setActiveShift(shift);
      setActiveProject(selected);
      await AsyncStorage.setItem(`active_project_${user.id}`, JSON.stringify(selected));
      startLiveTracking();
      setTimeout(() => {
        setSelectProjModal(false);
      }, 50);
      Alert.alert('Shift Started', `Shift started for: ${selected.name}`);
      navigation.navigate('ActivitiesTab');
    }
  };

  // 4. Calculate travel distance using Haversine formula
  const calculateTotalDistance = () => {
    if (routeCoordinates.length < 2) return 0.0;
    
    let total = 0.0;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371; // Earth's radius in km

    for (let i = 0; i < routeCoordinates.length - 1; i++) {
      const p1 = routeCoordinates[i];
      const p2 = routeCoordinates[i + 1];

      const dLat = toRad(p2.latitude - p1.latitude);
      const dLon = toRad(p2.longitude - p1.longitude);
      const lat1 = toRad(p1.latitude);
      const lat2 = toRad(p2.latitude);

      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      total += R * c;
    }
    return total;
  };

  // 4.5 Manual arrived override trigger
  const handleManualArrived = async () => {
    setArrived(true);
    if (activeProject) {
      const success = await supabaseService.updateProjectStatus(activeProject.id, 'active');
      if (success) {
        setActiveProject(prev => prev ? { ...prev, status: 'active' } : null);
        // Update AsyncStorage cache
        const cachedProj = await AsyncStorage.getItem(`active_project_${user.id}`);
        if (cachedProj) {
          const parsed = JSON.parse(cachedProj);
          parsed.status = 'active';
          await AsyncStorage.setItem(`active_project_${user.id}`, JSON.stringify(parsed));
        }
      }
    }
  };

  // 4.7 Complete Site
  const handleCompleteSite = async () => {
    if (activeProject) {
      const success = await supabaseService.updateProjectStatus(activeProject.id, 'completed');
      if (success) {
        Alert.alert('Site Completed', `Great job! ${activeProject.name} is now complete.`);
        await AsyncStorage.removeItem(`active_project_${user.id}`);
        setActiveProject(null);
        setArrived(false);
        loadDashboardData();
      } else {
        Alert.alert('Error', 'Failed to complete site. Please try again.');
      }
    }
  };

  // 5. End shift trigger
  const handleEndDay = async () => {
    Alert.alert(
      'End Your Day',
      'Are you sure you want to end your day and clock out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Day',
          style: 'destructive',
          onPress: async () => {
            if (trackingTimer.current?.remove) {
              trackingTimer.current.remove();
              trackingTimer.current = null;
            } else if (trackingTimer.current) {
              clearInterval(trackingTimer.current);
              trackingTimer.current = null;
            }

            const dist = calculateTotalDistance();
            const success = await supabaseService.endUserDay(user.id, dist, routeCoordinates);

            if (success) {
              Alert.alert(
                'Shift Ended Successfully',
                `Great job! Clocked out.\nDistance travelled: ${dist.toFixed(2)} km.\nRoute history sent to Admin.`
              );
              await AsyncStorage.removeItem(`active_project_${user.id}`);
              setActiveShift(null);
              setActiveProject(null);
              setRouteCoordinates([]);
              setArrived(false);
              loadDashboardData();
            } else {
              Alert.alert('Error', 'Failed to end shift. Please try again.');
            }
          }
        }
      ]
    );
  };

  // 6. Camera click with stamp drawing
  const captureMedia = async (type: 'image' | 'video') => {
    if (!activeProject) return;
    try {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Please grant camera permissions to capture reports.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: type === 'image' 
          ? ImagePicker.MediaTypeOptions.Images 
          : ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false, // Set to false to avoid crash on some Android devices with large files
        quality: 0.5, // Lower quality slightly to prevent memory issues and save bandwidth
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const localUri = result.assets[0].uri;
        
        // 1. Watermark image if we are on Web (pure HTML5 canvas) or Native (via hidden WebView)
        let uploadUri = localUri;
        if (type === 'image') {
          if (Platform.OS === 'web') {
            try {
              uploadUri = await new Promise<string>((resolve) => {
                const img = new window.Image();
                img.crossOrigin = 'anonymous';
                img.src = localUri;
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
                    
                    const text = `${activeProject.name} - ${new Date().toLocaleString()} - Widense`;
                    const textWidth = ctx.measureText(text).width;
                    
                    ctx.fillStyle = 'rgba(27, 20, 100, 0.6)'; // Indigo translucent
                    ctx.fillRect(15, img.height - fontSize - 25, textWidth + 30, fontSize + 15);
                    
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(text, 30, img.height - 20);
                  }
                  resolve(canvas.toDataURL('image/jpeg', 0.85));
                };
                img.onerror = () => resolve(localUri);
              });
            } catch (webWatermarkErr) {
              console.warn('Web watermarking failed:', webWatermarkErr);
            }
          } else {
            // Native Mobile watermarking via hidden WebView canvas
            // Temporarily bypassed due to Out Of Memory crashes on Android when reading large camera images as Base64.
            uploadUri = localUri;
            
            /*
            try {
              const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
              const mimeType = 'image/jpeg';
              
              const watermarkedBase64 = await new Promise<string>((resolve) => {
                watermarkResolveRef.current = resolve;
                const js = `
                  if (typeof window.watermarkImage === 'function') {
                    window.watermarkImage("data:${mimeType};base64,${base64}", "${activeProject.name.replace(/"/g, '\\"')}");
                  }
                  true;
                `;
                watermarkWebviewRef.current?.injectJavaScript(js);
                // Fallback timeout in case webview fails or is slow
                setTimeout(() => resolve(`data:${mimeType};base64,${base64}`), 6000);
              });
              
              // Save the watermarked image to a temporary file
              const tempFileUri = `${FileSystem.cacheDirectory}watermarked_${Date.now()}.jpg`;
              const base64Data = watermarkedBase64.split(',')[1];
              await FileSystem.writeAsStringAsync(tempFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
              uploadUri = tempFileUri;
            } catch (nativeWatermarkErr) {
              console.warn('Native watermarking failed:', nativeWatermarkErr);
            }
            */
          }
        }

        // 2. Save file locally in a folder named 'widense' with pattern: [ProjectName]_[Index].jpg / .mp4
        try {
          const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();
          if (mediaStatus === 'granted') {
            const projectCleanName = activeProject.name.replace(/[^a-zA-Z0-9]/g, '_');
            const countKey = `media_count_${activeProject.id}`;
            const currentCount = await AsyncStorage.getItem(countKey);
            const nextCount = currentCount ? parseInt(currentCount) + 1 : 1;
            await AsyncStorage.setItem(countKey, nextCount.toString());
            
            const extension = type === 'video' ? 'mp4' : 'jpg';
            const newFileName = `${projectCleanName}_${nextCount}.${extension}`;
            
            // Ensure directory exists in cache/local filesystem before saving to library
            const dirUri = `${FileSystem.cacheDirectory}widense/`;
            const dirInfo = await FileSystem.getInfoAsync(dirUri);
            if (!dirInfo.exists) {
              await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
            }
            
            const newLocalUri = `${dirUri}${newFileName}`;
            await FileSystem.copyAsync({
              from: localUri,
              to: newLocalUri
            });
            
            const asset = await MediaLibrary.createAssetAsync(newLocalUri);
            const album = await MediaLibrary.getAlbumAsync('widense');
            if (album) {
              await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
            } else {
              await MediaLibrary.createAlbumAsync('widense', asset, false);
            }
            console.log('[Media] Saved locally to Gallery Album "widense" as:', newFileName);

            // We use the newLocalUri for the upload so the watermarked image is used (or just local image)
            // Wait, uploadUri could be the web watermark one, but we are copying localUri. Let's just use newLocalUri
            uploadUri = newLocalUri;
          }
        } catch (saveErr) {
          console.warn('Failed to save media to local storage:', saveErr);
        }

        // Upload media to Supabase storage so the admin can view/download it
        const publicUrl = await supabaseService.uploadFieldMedia(user.id, activeProject.id, uploadUri);
        
        if (!publicUrl) {
          Alert.alert('Upload Failed', 'Failed to upload media to server.');
          return;
        }

        // Generate stamped photo in Supabase (saving the public URL instead of localUri)
        const capture = await supabaseService.addMediaCapture({
          project_id: activeProject.id,
          user_id: user.id,
          media_type: type,
          file_url: publicUrl
        });

        if (capture) {
          Alert.alert(
            'Report Stamped & Uploaded!',
            `Report captured and successfully sent to the Admin dashboard!`
          );
        } else {
          Alert.alert('Error', 'Failed to save media record.');
        }
      }
    } catch (err: any) {
      console.error('[Media] captureMedia error:', err);
      Alert.alert('Capture Error', String(err?.message || err?.toString?.() || err));
    }
  };

  // Check if a calendar date has an assigned project
  const dateHasProject = (date: Date) => {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dStr = weekdays[date.getDay()];
    const isoStr = date.toISOString().split('T')[0];
    return allProjects.some((p) => p.day === dStr || p.day === isoStr);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f5474c" />
      </View>
    );
  }

  const isShiftActive = activeShift && !activeShift.ended_at;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Navbar */}
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={26} color="#f5474c" />
        </TouchableOpacity>

        <Image source={wtLogo} style={styles.logoImage} resizeMode="contain" />

        <TouchableOpacity style={styles.profileContainer}>
          <View style={styles.avatarCircle}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarTxt}>{displayName[0].toUpperCase()}</Text>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Greetings */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingTitle}>{greeting},</Text>
          <Text style={styles.userName}>{displayName}</Text>
        </View>

        {/* Start / End Shift Buttons */}
        {!isShiftActive ? (
          <TouchableOpacity style={styles.ctaButton} onPress={handleStartDay}>
            <Ionicons name="play" size={20} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.ctaText}>Start Your Day</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.activeShiftCard}>
            <View style={styles.activeShiftHeader}>
              <View style={styles.pulseContainer}>
                <View style={styles.pulseInner} />
              </View>
              <Text style={styles.activeShiftTitle}>Shift Currently Active</Text>
            </View>
            {activeProject ? (
              <View style={styles.projectDetailsCard}>
                <Text style={styles.projectSiteLabel}>CURRENT DESTINATION</Text>
                <Text style={styles.projectSiteName}>{activeProject.name}</Text>
                <Text style={styles.projectSiteAddr}>{activeProject.location_name}</Text>
              </View>
            ) : (
              <View style={styles.projectDetailsCard}>
                <Text style={styles.projectSiteName}>No Active Destination</Text>
                <Text style={styles.projectSiteAddr}>Please select your next site.</Text>
                <TouchableOpacity style={[styles.ctaButton, { marginTop: 12, marginBottom: 0, height: 44 }]} onPress={() => setSelectProjModal(true)}>
                  <Text style={styles.ctaText}>Choose Next Destination</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Arrived Toggle and Photo / Video reports */}
            {activeProject && !arrived && (
              <TouchableOpacity style={styles.arriveBtn} onPress={handleManualArrived}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.arriveBtnText}>I Have Arrived at Location</Text>
              </TouchableOpacity>
            )}

            {activeProject && arrived && (
              <View style={styles.mediaActionsContainer}>
                <Text style={styles.mediaSectionTitle}>Watermarked Field Reports</Text>
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.mediaBtn, { marginRight: 12 }]} onPress={() => captureMedia('image')}>
                    <Ionicons name="camera" size={22} color="#FFF" />
                    <Text style={styles.mediaBtnText}>Click Picture</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.mediaBtn} onPress={() => captureMedia('video')}>
                    <Ionicons name="videocam" size={22} color="#FFF" />
                    <Text style={styles.mediaBtnText}>Take Video</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={[styles.arriveBtn, { marginTop: 16, backgroundColor: '#2E7D32' }]} onPress={handleCompleteSite}>
                  <Ionicons name="checkmark-done-circle" size={20} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.arriveBtnText}>Submit & Complete Site</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.endShiftBtn} onPress={handleEndDay}>
              <Ionicons name="stop" size={18} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.ctaText}>End Your Day</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Real Dynamic Mini Calendar Slider */}
        <View style={styles.calendarSection}>
          <Text style={styles.sectionTitle}>Your Schedule</Text>
          <View style={styles.calendarSlider}>
            {calendarDays.map((date, idx) => {
              const isToday = date.toDateString() === new Date().toDateString();
              const hasTask = dateHasProject(date);
              const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              
              return (
                <View key={idx} style={[styles.calendarCard, isToday && styles.calendarCardToday]}>
                  {hasTask && <View style={styles.indicatorDot} />}
                  <Text style={[styles.calendarDayText, isToday && styles.calendarTextToday]}>
                    {daysOfWeek[date.getDay()]}
                  </Text>
                  <Text style={[styles.calendarNumText, isToday && styles.calendarTextToday]}>
                    {date.getDate()}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Daily Activities Checklist */}
        <View style={styles.activitiesSection}>
          <Text style={styles.sectionTitle}>Today's Assignments</Text>
          {todayProjects.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkbox-outline" size={32} color="#CBD5E0" />
              <Text style={styles.emptyCardText}>No installations scheduled for today.</Text>
            </View>
          ) : (
            todayProjects.map((proj) => (
              <View key={proj.id} style={styles.activityCard}>
                <View style={styles.activityDot} />
                <View style={styles.activityDetails}>
                  <Text style={styles.activityName}>{proj.name}</Text>
                  <Text style={styles.activityAddr}>{proj.location_name}</Text>
                </View>
                {proj.require_media && (
                  <View style={styles.reqBadge}>
                    <Text style={styles.reqBadgeText}>Media Req</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* MULTIPLE DESTINATIONS SELECT MODAL */}
      <Modal visible={selectProjModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choose Today's Destination</Text>
            <Text style={styles.modalSubtitle}>Multiple sites assigned to you today. Pick your start location:</Text>

            <ScrollView style={{ maxHeight: 250, marginVertical: 14 }}>
              {todayProjects.filter(p => p.status !== 'completed').length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#718096', marginVertical: 20 }}>You have completed all assignments for today.</Text>
              ) : (
                todayProjects.filter(p => p.status !== 'completed').map((proj) => (
                  <TouchableOpacity
                    key={proj.id}
                    style={styles.modalProjCard}
                    onPress={() => handleSelectProjectAndStart(proj)}
                  >
                    <Ionicons name="location" size={20} color="#f5474c" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalProjName}>{proj.name}</Text>
                      <Text style={styles.modalProjAddr}>{proj.location_name}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#A0AEC0" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setSelectProjModal(false)}>
              <Text style={styles.cancelModalTxt}>Cancel Start Shift</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Hidden WebView for canvas-based image watermarking on Native Mobile */}
      {Platform.OS !== 'web' && (
        <WebView
          ref={watermarkWebviewRef}
          source={{ html: watermarkHTML }}
          style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}
          originWhitelist={['*']}
          onMessage={handleWatermarkMessage}
        />
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
  },
  logoImage: {
    width: 90,
    height: 40,
  },
  iconButton: {
    padding: 6,
  },
  profileContainer: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1b1464',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#f5474c',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  avatarTxt: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
  },
  scrollContent: {
    paddingBottom: 110, // absolute tabs padding space
  },
  greetingSection: {
    paddingHorizontal: 24,
    marginTop: 20,
    marginBottom: 20,
  },
  greetingTitle: {
    fontSize: 26,
    color: '#888',
    fontWeight: '400',
    fontFamily: 'Poppins_400Regular',
  },
  userName: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#1b1464',
    marginTop: 2,
    fontFamily: 'Poppins_700Bold',
  },
  ctaButton: {
    backgroundColor: '#f5474c', // Premium Coral Red
    marginHorizontal: 24,
    borderRadius: 18,
    height: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#f5474c',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      web: {
        boxShadow: '0px 6px 10px rgba(245, 71, 76, 0.25)',
      },
    }),
    marginBottom: 20,
  },
  ctaText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 0.5,
  },
  activeShiftCard: {
    backgroundColor: '#FFF5F5', // Soft warm light red tint
    borderWidth: 1.5,
    borderColor: '#FFD1D2', // Coral red outline
    borderRadius: 24,
    marginHorizontal: 24,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#f5474c',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
      },
      web: {
        boxShadow: '0px 8px 16px rgba(245, 71, 76, 0.05)',
      },
    }),
  },
  activeShiftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  pulseContainer: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(245, 71, 76, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  pulseInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f5474c',
  },
  activeShiftTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f5474c',
    fontFamily: 'Poppins_700Bold',
  },
  projectDetailsCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  projectSiteLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#f5474c',
    fontFamily: 'Poppins_700Bold',
    marginBottom: 4,
  },
  projectSiteName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  projectSiteAddr: {
    fontSize: 12,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    marginTop: 4,
  },
  arriveBtn: {
    backgroundColor: '#1b1464',
    borderRadius: 14,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  arriveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  mediaActionsContainer: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 14,
  },
  mediaSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  mediaBtn: {
    flex: 1,
    backgroundColor: '#1b1464', // Deep Indigo for robust aesthetic
    borderRadius: 12,
    height: 44,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
    marginLeft: 6,
  },
  endShiftBtn: {
    backgroundColor: '#f5474c', // Coral Red clock-out
    borderRadius: 14,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#f5474c',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      web: {
        boxShadow: '0px 4px 8px rgba(245, 71, 76, 0.2)',
      },
    }),
  },
  calendarSection: {
    paddingHorizontal: 24,
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b1464',
    marginBottom: 14,
    fontFamily: 'Poppins_700Bold',
  },
  calendarSlider: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calendarCard: {
    width: 42,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  calendarCardToday: {
    backgroundColor: '#1b1464',
    elevation: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      web: {
        boxShadow: '0px 4px 6px rgba(27, 20, 100, 0.15)',
      },
    }),
  },
  indicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#f5474c',
    position: 'absolute',
    top: 6,
  },
  calendarDayText: {
    fontSize: 10,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
  },
  calendarNumText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1A202C',
    fontFamily: 'Poppins_700Bold',
    marginTop: 2,
  },
  calendarTextToday: {
    color: '#FFF',
  },
  activitiesSection: {
    paddingHorizontal: 24,
    marginTop: 18,
  },
  emptyCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
  },
  emptyCardText: {
    fontSize: 13,
    color: '#A0AEC0',
    fontFamily: 'Roboto_400Regular',
    marginTop: 10,
    textAlign: 'center',
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#1b1464',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
      },
      web: {
        boxShadow: '0px 4px 8px rgba(27, 20, 100, 0.02)',
      },
    }),
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f5474c',
    marginRight: 14,
  },
  activityDetails: {
    flex: 1,
  },
  activityName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  activityAddr: {
    fontSize: 11,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    marginTop: 2,
  },
  reqBadge: {
    backgroundColor: '#FFEAEA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  reqBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#f5474c',
    fontFamily: 'Poppins_700Bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(27, 20, 100, 0.65)',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 28,
    padding: 24,
    elevation: 5,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
      },
      web: {
        boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.15)',
      },
    }),
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  modalProjCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  modalProjName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  modalProjAddr: {
    fontSize: 11,
    color: '#718096',
    fontFamily: 'Roboto_400Regular',
    marginTop: 2,
  },
  cancelModalBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 10,
  },
  cancelModalTxt: {
    color: '#f5474c',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Poppins_700Bold',
  },
  row: {
    flexDirection: 'row',
  }
});
