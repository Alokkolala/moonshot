import { createClient } from "@supabase/supabase-js";

// Browser Supabase client. Uses the public anon key — every read/write is boxed
// to the signed-in user's own rows by row-level security. The service-role key
// lives only on the worker; it must never reach the browser bundle.
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Fail loudly in dev rather than throwing opaque "fetch failed" later.
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY env vars.");
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
