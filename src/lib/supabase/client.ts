/**
 * NeXifyAI Builder - Supabase Client
 * Zentrale Supabase-Client-Instanz
 */

import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = "https://twjssiysjhnxjqilmwlq.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_YcXRDy6Zpdcda43SzQgj-w_Tz0P5RI4";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

