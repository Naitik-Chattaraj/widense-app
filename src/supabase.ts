import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

console.log('[Supabase] Connecting to:', supabaseUrl.slice(0, 40) + '...');

// On web (browser): use default localStorage storage and detect session in URL (for OAuth)
// On native (iOS/Android): use AsyncStorage for persistent auth sessions
const authConfig = Platform.OS === 'web'
  ? {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    }
  : {
      storage: AsyncStorage as any,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: authConfig,
});

