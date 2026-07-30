import { supabaseServer } from '@/lib/supabase/server'
import { getPlateItems, plateCount } from '@/lib/plate'
import { TabBar } from '@/components/ui/TabBar'
import type { Profile } from '@/lib/types'

// Decides whether the app wears its chrome. Lives in the layout so the tab bar
// survives navigation instead of remounting per page, which is also what keeps
// the plate badge from flickering on every route change.
//
// It stays off for anyone who is not a member yet. Which routes hide it is the
// TabBar's own call, because a layout never learns the pathname and the
// alternative was threading it through the session proxy for one boolean.
export default async function Chrome() {
  const supabase = await supabaseServer()
  const { data: claims } = await supabase.auth.getClaims()
  const uid = claims?.claims?.sub
  if (!uid) return null

  const { data } = await supabase.from('users').select('*').eq('id', uid).maybeSingle()
  const profile = data as Profile | null
  // A pending account sees the waiting room and nothing else, the same rule
  // RLS enforces underneath.
  if (!profile || profile.status !== 'active') return null

  const board = await getPlateItems(supabase, profile.id)
  return <TabBar plateCount={plateCount(board)} />
}
