import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

// Server-side gate: signed-in + active account, or you go back to the door.
// The real enforcement is RLS (is_active_user() on every policy) — this only
// decides which page you land on.
export async function requireProfile() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (!data) redirect('/')
  const profile = data as Profile
  if (profile.status !== 'active') redirect('/pending')
  return { supabase, profile }
}
