import { createClient } from '@supabase/supabase-js';

// The app's backend: this project's Supabase instance.
//
// Only the publishable (anon) key belongs in the browser — row level security
// decides what a signed-in person may read and write, and private media is
// reached through short-lived signed URLs.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export const mediaBucket = (kind) => (kind === 'video' ? 'beam-videos' : 'beam-images');
