import { cache } from 'react'
import { headers } from 'next/headers'
import { supabaseServer } from './supabase/server'
import { resolveLang, t as translate, tf as format, type Lang, type StringKey } from './lang'

// The language for this request, for server components.
//
// The override wins because somebody went and chose it; otherwise the phone
// decides, as reported in Accept-Language. Read in the root layout and handed
// down, so no screen resolves it a second time and lands somewhere else.
//
// A signed-out visitor has no override to read, and the sign-in screen is
// exactly where following the phone matters most.
// cache() dedupes this for the length of one request. Every server component
// that prints a word asks for the language, and without this each one would
// cost its own claim check and its own select.
export const currentLang = cache(async function currentLang(): Promise<Lang> {
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
})

// The language and a bound translator, for server components. `const { t } =
// await getT()` reads better at the call site than threading `lang` through
// every string, and the language is still there for anything that needs it.
export const getT = cache(async function getT() {
  const lang = await currentLang()
  return { lang, t: (key: StringKey) => translate(lang, key), tf: (key: StringKey, vals: Record<string, string | number>) => format(lang, key, vals) }
})
