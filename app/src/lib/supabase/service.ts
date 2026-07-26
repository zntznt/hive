import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Service-role client for the notification pipeline only. NEVER import this
// from a client component: the key bypasses every RLS policy.
//
// The dispatcher used to run under the acting user's session, which cannot
// work. notification_templates is readable only by app admins, so every
// non-admin filed their notifications as "sin plantilla", and the outbox
// SELECT policy is scoped to your own rows, so a notification addressed to
// anybody else was invisible to the person whose action created it. Sending
// is infrastructure, not something a member should be able to read, so it
// runs with its own credentials instead of widening those policies.
//
// Returns null when the key is unset so callers can fall back to the user's
// client and the app keeps working (badly, as before) rather than crashing.
let cached: SupabaseClient | null = null

export function supabaseService(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url) return null
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return cached
}
