import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../supabase';
import { API_URL } from './auth';

export interface Profile {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  admin: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  location_name: string;
  latitude: number;
  longitude: number;
  day: string; // e.g. "Monday", "Tuesday" or custom ISO string
  assigned_to: string | null;
  require_media: boolean;
  status: 'pending' | 'active' | 'completed';
  created_at: string;
}

export interface UserDay {
  id: string;
  user_id: string;
  day: string; // date string YYYY-MM-DD
  started_at: string;
  ended_at: string | null;
  distance_km: number;
  route_history: Array<{ latitude: number; longitude: number; timestamp: string }>;
  created_at: string;
  profiles?: Profile;
}

export interface MediaCapture {
  id: string;
  project_id: string;
  user_id: string;
  media_type: 'image' | 'video';
  file_url: string;
  captured_at: string;
  projects?: Project;
  profiles?: Profile;
}

export interface UserLocation {
  user_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
  profiles?: Profile;
}

export const supabaseService = {
  // --- Profiles ---
  async getProfile(userId: string, fallbackEmail?: string, fallbackName?: string): Promise<Profile | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('[SupabaseService] getProfile error:', error.message);
        return null;
      }

      if (!data && fallbackEmail) {
        // Self-heal: Auto-create profile row if it doesn't exist yet!
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert([{
            id: userId,
            display_name: fallbackName || 'Worker',
            email: fallbackEmail,
            admin: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (createError) {
          console.error('[SupabaseService] Failed to auto-create profile:', createError.message);
          return null;
        }
        return newProfile;
      }

      return data;
    } catch (err) {
      console.error('[SupabaseService] getProfile exception:', err);
      return null;
    }
  },

  async getAllUsers(): Promise<Profile[]> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('display_name', { ascending: true });

      if (error) {
        console.error('[SupabaseService] getAllUsers error:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[SupabaseService] getAllUsers exception:', err);
      return [];
    }
  },

  async updateProfile(userId: string, updates: Partial<Profile>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', userId);

      if (error) {
        console.error('[SupabaseService] updateProfile error:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[SupabaseService] updateProfile exception:', err);
      return false;
    }
  },

  async uploadAvatar(userId: string, uri: string): Promise<string | null> {
    try {
      let extension = 'jpg';
      if (uri.includes('.')) {
        const parts = uri.split('.');
        const ext = parts[parts.length - 1].toLowerCase().split('?')[0];
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
          extension = ext;
        }
      }

      const filePath = `${userId}/avatar_${Date.now()}.${extension}`;

      if (Platform.OS !== 'web') {
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://reedjqimnpidlmvbadca.supabase.co';
        const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
        const uploadUrl = `${supabaseUrl}/storage/v1/object/avatars/${filePath}`;

        const response = await FileSystem.uploadAsync(uploadUrl, uri, {
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        });

        if (response.status !== 200) {
          console.error('[SupabaseService] uploadAvatar native upload error:', response.body);
          return null;
        }
      } else {
        const response = await fetch(uri);
        const blob = await response.blob();

        const { error } = await supabase.storage
          .from('avatars')
          .upload(filePath, blob, {
            upsert: true,
            contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`
          });

        if (error) {
          console.error('[SupabaseService] uploadAvatar error:', error.message);
          return null;
        }
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (err) {
      console.error('[SupabaseService] uploadAvatar exception:', err);
      return null;
    }
  },

  async uploadFieldMedia(userId: string, projectId: string, uri: string): Promise<string | null> {
    try {
      // Detect extension from URI — handles file:// paths, data URIs, and plain paths
      let extension = 'jpg';
      let mimeType = 'image/jpeg';

      if (uri.startsWith('data:')) {
        // Web canvas data URI e.g. data:image/jpeg;base64,...
        const mimeMatch = uri.match(/^data:([^;]+);/);
        if (mimeMatch) {
          mimeType = mimeMatch[1];
          const subtype = mimeType.split('/')[1];
          extension = subtype === 'jpeg' ? 'jpg' : subtype || 'jpg';
        }
      } else {
        // File URI — extract extension from path (strip query params)
        const cleanPath = uri.split('?')[0];
        const lastDot = cleanPath.lastIndexOf('.');
        if (lastDot !== -1) {
          const ext = cleanPath.substring(lastDot + 1).toLowerCase();
          if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov'].includes(ext)) {
            extension = ext;
            if (ext === 'mp4' || ext === 'mov') {
              mimeType = `video/${ext}`;
            } else {
              mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
            }
          }
        }
      }

      const fileName = `${userId}_${Date.now()}.${extension}`;
      const uploadUrl = `${API_URL}/api/upload-media`;

      console.log(`[SupabaseService] Uploading to: ${uploadUrl} | file: ${fileName} | mime: ${mimeType}`);

      const formData = new FormData();
      
      if (Platform.OS !== 'web') {
        // React Native FormData: keep the full URI as-is (both Android and iOS use file:// URIs)
        formData.append('file', {
          uri: uri,
          name: fileName,
          type: mimeType
        } as any);
      } else {
        // Web: for data URIs (watermarked canvas output) convert to blob; for file:// fetch directly
        const response = await fetch(uri);
        const blob = await response.blob();
        formData.append('file', blob, fileName);
      }
      
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          // Do NOT set Content-Type manually — fetch sets it with the correct multipart boundary
        },
      });
      
      if (!uploadRes.ok) {
        const errorData = await uploadRes.text();
        console.error('[SupabaseService] uploadFieldMedia server error:', uploadRes.status, errorData);
        return null;
      }
      
      const data = await uploadRes.json();
      console.log('[SupabaseService] Upload successful:', data.directUrl || data.webViewLink);
      return data.directUrl || data.webViewLink;

    } catch (err) {
      console.error('[SupabaseService] uploadFieldMedia exception:', err);
      return null;
    }
  },

  // --- Projects ---
  async getProjects(userId?: string, day?: string): Promise<Project[]> {
    try {
      let query = supabase.from('projects').select('*');

      if (userId) {
        query = query.eq('assigned_to', userId);
      }
      if (day) {
        // day can be day of week e.g. "Monday" or specific calendar date YYYY-MM-DD
        query = query.eq('day', day);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('[SupabaseService] getProjects error:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[SupabaseService] getProjects exception:', err);
      return [];
    }
  },

  async createProject(project: Omit<Project, 'id' | 'created_at' | 'status'>): Promise<Project | null> {
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert([{ ...project, status: 'pending' }])
        .select()
        .single();

      if (error) {
        console.error('[SupabaseService] createProject error:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.error('[SupabaseService] createProject exception:', err);
      return null;
    }
  },

  async updateProjectStatus(projectId: string, status: 'pending' | 'active' | 'completed'): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status })
        .eq('id', projectId);

      if (error) {
        console.error('[SupabaseService] updateProjectStatus error:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[SupabaseService] updateProjectStatus exception:', err);
      return false;
    }
  },

  // --- User Shift Logs (user_days) ---
  async getTodayUserDay(userId: string): Promise<UserDay | null> {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('user_days')
        .select('*')
        .eq('user_id', userId)
        .eq('day', todayStr)
        .maybeSingle();

      if (error) {
        console.error('[SupabaseService] getTodayUserDay error:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.error('[SupabaseService] getTodayUserDay exception:', err);
      return null;
    }
  },

  async startUserDay(userId: string): Promise<UserDay | null> {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // Use upsert so restarting the app mid-shift doesn't crash with a duplicate key.
      // onConflict targets the unique constraint (user_id, day).
      // ignoreDuplicates:true means: if the row exists, do nothing (keep existing started_at/route etc.)
      const { data, error } = await supabase
        .from('user_days')
        .upsert(
          [{
            user_id: userId,
            day: todayStr,
            started_at: new Date().toISOString(),
            ended_at: null,
            distance_km: 0.0,
            route_history: []
          }],
          { onConflict: 'user_id,day', ignoreDuplicates: true }
        )
        .select()
        .maybeSingle();

      if (error) {
        console.error('[SupabaseService] startUserDay error:', error.message);
        return null;
      }

      // ignoreDuplicates:true returns null data when the row already existed —
      // fetch it directly so the caller always gets the active shift record.
      if (!data) {
        const { data: existing, error: fetchErr } = await supabase
          .from('user_days')
          .select('*')
          .eq('user_id', userId)
          .eq('day', todayStr)
          .single();

        if (fetchErr) {
          console.error('[SupabaseService] startUserDay fetch existing error:', fetchErr.message);
          return null;
        }
        return existing;
      }

      return data;
    } catch (err) {
      console.error('[SupabaseService] startUserDay exception:', err);
      return null;
    }
  },

  async endUserDay(userId: string, distanceKm: number, routeHistory: any[]): Promise<boolean> {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('user_days')
        .update({
          ended_at: new Date().toISOString(),
          distance_km: distanceKm,
          route_history: routeHistory
        })
        .eq('user_id', userId)
        .eq('day', todayStr);

      if (error) {
        console.error('[SupabaseService] endUserDay error:', error.message);
        return false;
      }

      // Also clean up location coordinates from live updates
      await supabase.from('user_locations').delete().eq('user_id', userId);

      return true;
    } catch (err) {
      console.error('[SupabaseService] endUserDay exception:', err);
      return false;
    }
  },

  async getUserDaysHistory(userId?: string): Promise<UserDay[]> {
    try {
      let query = supabase.from('user_days').select('*, profiles(*)');
      if (userId) {
        query = query.eq('user_id', userId);
      }
      const { data, error } = await query.order('day', { ascending: false });

      if (error) {
        console.error('[SupabaseService] getUserDaysHistory error:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[SupabaseService] getUserDaysHistory exception:', err);
      return [];
    }
  },

  // --- Media Captures ---
  async addMediaCapture(capture: Omit<MediaCapture, 'id' | 'captured_at'>): Promise<MediaCapture | null> {
    try {
      const { data, error } = await supabase
        .from('media_captures')
        .insert([capture])
        .select()
        .single();

      if (error) {
        console.error('[SupabaseService] addMediaCapture error:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.error('[SupabaseService] addMediaCapture exception:', err);
      return null;
    }
  },

  async getMediaCaptures(projectId?: string): Promise<MediaCapture[]> {
    try {
      let query = supabase
        .from('media_captures')
        .select('*, projects(*), profiles(*)');
      
      if (projectId) {
        query = query.eq('project_id', projectId);
      }
      
      const { data, error } = await query.order('captured_at', { ascending: false });

      if (error) {
        console.error('[SupabaseService] getMediaCaptures error:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[SupabaseService] getMediaCaptures exception:', err);
      return [];
    }
  },

  // --- Active Live GPS Tracking (user_locations) ---
  async updateLiveLocation(userId: string, latitude: number, longitude: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_locations')
        .upsert({
          user_id: userId,
          latitude,
          longitude,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('[SupabaseService] updateLiveLocation error:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[SupabaseService] updateLiveLocation exception:', err);
      return false;
    }
  },

  async getActiveLocations(): Promise<UserLocation[]> {
    try {
      const { data, error } = await supabase
        .from('user_locations')
        .select('*, profiles(*)');

      if (error) {
        console.error('[SupabaseService] getActiveLocations error:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[SupabaseService] getActiveLocations exception:', err);
      return [];
    }
  }
};
