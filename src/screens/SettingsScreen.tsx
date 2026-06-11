import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { authService } from '../services/auth';
import { supabaseService } from '../services/supabaseService';

interface SettingsScreenProps {
  user: any;
  onLogout: () => void;
  onUpdateUser: (updatedFields: any) => void;
}

export default function SettingsScreen({ user, onLogout, onUpdateUser }: SettingsScreenProps) {
  const [uploading, setUploading] = useState<boolean>(false);
  const fileInputRef = useRef<any>(null);

  const handleLogout = async () => {
    try {
      await authService.logout();
      onLogout();
    } catch (e) {
      onLogout();
    }
  };

  const handleUploadImage = async (uri: string) => {
    setUploading(true);
    try {
      const publicUrl = await supabaseService.uploadAvatar(user.id, uri);
      if (publicUrl) {
        const success = await supabaseService.updateProfile(user.id, { avatar_url: publicUrl });
        if (success) {
          onUpdateUser({ avatar_url: publicUrl });
          Alert.alert('Success', 'Profile picture updated successfully!');
        } else {
          Alert.alert('Error', 'Failed to save avatar path to profile.');
        }
      } else {
        Alert.alert('Error', 'Failed to upload image to Supabase.');
      }
    } catch (err) {
      console.error('[UploadImage] exception:', err);
      Alert.alert('Error', 'An unexpected error occurred during upload.');
    } finally {
      setUploading(false);
    }
  };

  const handlePickImageNative = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please grant library permissions to change your profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await handleUploadImage(result.assets[0].uri);
      }
    } catch (err) {
      console.error('[PickImageNative] error:', err);
      Alert.alert('Error', 'Failed to select image from gallery.');
    }
  };

  const handlePickImageWeb = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleWebFileChange = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    await handleUploadImage(objectUrl);
  };

  const triggerImagePicker = () => {
    if (Platform.OS === 'web') {
      handlePickImageWeb();
    } else {
      handlePickImageNative();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>
      <View style={styles.content}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <TouchableOpacity 
            style={styles.avatarWrapper} 
            onPress={triggerImagePicker}
            disabled={uploading}
            activeOpacity={0.8}
          >
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(user?.name || user?.user_metadata?.display_name || 'W')[0].toUpperCase()}
                </Text>
              </View>
            )}

            {uploading ? (
              <View style={styles.avatarLoader}>
                <ActivityIndicator size="small" color="#FFF" />
              </View>
            ) : (
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={12} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>

          {/* Web Hidden File Input */}
          {Platform.OS === 'web' && (
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleWebFileChange}
              accept="image/*"
              style={{ display: 'none' }}
            />
          )}

          <View style={styles.profileInfo}>
            <Text style={styles.name}>
              {user?.name || user?.user_metadata?.display_name || 'Worker'}
            </Text>
            <Text style={styles.email}>{user?.email || 'howard1990@gmail.com'}</Text>
          </View>
        </View>

        {/* Action Items */}
        <View style={styles.menuList}>
          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="person-outline" size={22} color="#1b1464" />
            <Text style={styles.menuText}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={18} color="#CCC" style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#1b1464" />
            <Text style={styles.menuText}>Privacy & Security</Text>
            <Ionicons name="chevron-forward" size={18} color="#CCC" style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, styles.logoutItem]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={22} color="#f5474c" />
            <Text style={[styles.menuText, styles.logoutText]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  content: {
    padding: 20,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(27, 20, 100, 0.05)', // Transparent Navy tint
    borderRadius: 24,
    padding: 20,
    marginBottom: 30,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1b1464', // Dark Navy avatar background
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#f5474c',
    backgroundColor: '#F8FAFC',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    fontFamily: 'Poppins_700Bold',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#f5474c',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  avatarLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(27, 20, 100, 0.65)',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b1464',
    fontFamily: 'Poppins_700Bold',
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    fontFamily: 'Roboto_400Regular', // Roboto for body/subtext
  },
  menuList: {
    gap: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    borderRadius: 16,
    backgroundColor: '#FFF',
  },
  menuText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 14,
    flex: 1,
    fontFamily: 'Poppins_600SemiBold',
  },
  chevron: {
    marginLeft: 'auto',
  },
  logoutItem: {
    borderColor: '#FEE2E2', // light red border
    marginTop: 10,
  },
  logoutText: {
    color: '#f5474c', // professional logout color
  },
});
