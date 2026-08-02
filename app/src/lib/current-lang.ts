import { headers } from 'next/headers'
import { supabaseServer } from './supabase/server'
import { resolveLang, type Lang } from './lang'

// The language for this request, for server components.
//
// The override wins because somebody went and chose it; otherwise the phone
// decides, as reported in Accept-Language. Read in the root layout and handed
// down, so no screen resolves it a second time and lands somewhere else.
//
// A signed-out visitor has no override to read, and the sign-in screen is
// exactly where following the phone matters most.
export async function currentLang(): Promise<Lang> {
  const accept = (await headers()).get('accept-language')
  try {
    const supabase = await supabaseServer()
    // getClaims(), not getUser(). getUser() is a round trip that also refreshes
    // the token, and a layout cannot reliably write the rotated cookie back:
    // doing it here logged the session out mid-render and every page after it
    // rendered as a signed-out visitor. getClaims() verifies locally and
    // touches nothing, which is why the rest of the codebase uses it.
    const { data: claims } = await supabase.auth.getClaims()
    const uid = claims?.claims?.sub
    if (!uid) return resolveLang(null, accept)
    const { data } = await supabase.from('users').select('lang').eq('id', uid).maybeSingle()
    return resolveLang((data?.lang as Lang | null) ?? null, accept)
  } catch {
    // Auth being unreachable is not a reason to render nothing.
    return resolveLang(null, accept)
  }
}
