import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

// Who this request is, once.
//
// This was read twice: here, to decide whether you may see the page, and
// again in currentLang, to look up the language you chose. Two reads of one
// fact, and they could answer differently. getClaims() with no argument goes
// through getSession(), which refreshes an expired access token, and a
// refresh in a server component cannot write its rotated cookie back (the
// setAll in supabase/server.ts throws there and swallows it). So the second
// caller re-read the same stale cookie and refreshed again, on a refresh
// token the first one had already rotated. Outside Supabase's reuse interval
// that second refresh is rejected.
//
// Which caller lost decided what broke. The gate losing sends a signed-in
// member to the door. currentLang losing is quieter and worse: the page
// renders, signed in, with the member's own name on it, in whatever language
// their phone asked for. An account set to Español reading an English screen.
//
// cache() is per request, so this is one verification and one answer, and the
// two cannot come apart. proxy.ts still does the refresh up front on every
// page request; this is what happens when that one did not take.
export const requestUserId = cache(async function requestUserId(): Promise<string | null> {
  try {
    const supabase = await supabaseServer()
    const { data, error } = await supabase.auth.getClaims()
    const uid = data?.claims?.sub ?? null
    if (!uid) await reportNoClaims(error?.message ?? 'no sub in claims')
    return uid ?? null
  } catch (e) {
    // The signing keys are fetched and cached, so a cold cache or a blip
    // reaching Auth throws rather than answering. proxy.ts makes the same
    // call and treats it the same way: no id, and the caller decides.
    await reportNoClaims(e instanceof Error ? e.message : 'threw')
    return null
  }
})

// A signed out visitor resolving to nobody is the normal case and most of the
// traffic. A request that CARRIES a session cookie and still resolves to
// nobody is not, and it is the shape behind the one thing this sweep could not
// reproduce: a page that rendered signed in, with the member's own name on it,
// in the language their phone asked for rather than the one their account
// says. That needs the gate and the language to have disagreed, which cannot
// happen now they share this read, so the remaining suspect is this read
// itself failing on some requests and not others.
//
// Deliberately not thrown and not shown. It is a note for whoever reads the
// runtime logs, and a page that renders is better than a page that does not.
async function reportNoClaims(reason: string) {
  try {
    const jar = await cookies()
    if (!jar.getAll().some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))) return
    console.warn(`[hive:auth] session cookie present but no claims: ${reason}`)
  } catch {
    // headers are gone, which means nobody is waiting on this anyway
  }
}

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
  const uid = await requestUserId()
  if (!uid) redirect('/')
  const { data } = await supabase.from('users').select('*').eq('id', uid).single()
  if (!data) redirect('/')
  const profile = data as Profile
  if (profile.status !== 'active') redirect('/pending')
  return { supabase, profile }
}
