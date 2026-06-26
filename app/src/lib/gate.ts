import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

// Server-side gate: signed-in + active account, or you go back to the door.
// The real enforcement is RLS (is_active_user() on every policy); this only
// decides which page you land on.
//
// getClaims() verifies the JWT locally (project uses ES256 asymmetric keys), so
// it costs ~0ms instead of getUser()'s round trip to Auth in the DB region. The
// profile row we fetch right after is itself proof the token is valid (RLS would
// return nothing otherwise), so we lose no real security.
export async function requireProfile() {
  const supabase = await supabaseServer()
  const { data: claimsData } = await supabase.auth.getClaims()
  const uid = claimsData?.claims?.sub
  if (!uid) redirect('/')
  const { data } = await supabase.from('users').select('*').eq('id', uid).single()
  if (!data) redirect('/')
  const profile = data as Profile
  if (profile.status !== 'active') redirect('/pending')
  return { supabase, profile }
}
