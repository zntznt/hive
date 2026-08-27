import { cache } from 'react'
import { headers } from 'next/headers'
import { supabaseServer } from './supabase/server'
import { requestUserId } from './gate'
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
  // `requestUserId` from the gate, not a second read of the same fact. This
  // used to call getClaims() itself, which meant the page and the words on it
  // could disagree about who was reading them: the gate let a member in while
  // this fell back to their phone's language and served a Spanish account an
  // English screen. See the note there for why two reads could differ at all.
  const uid = await requestUserId()
  if (!uid) return resolveLang(null, accept)
  try {
    const supabase = await supabaseServer()
    const { data } = await supabase.from('users').select('lang').eq('id', uid).maybeSingle()
    // A member who has not chosen reads as null here and follows their phone,
    // which is the "Sigue tu teléfono" setting doing its job. A row we could
    // not read reads the same way, which is a guess rather than an answer, but
    // it is the same guess the sign-in screen makes and it beats rendering
    // nothing.
    return resolveLang((data?.lang as Lang | null) ?? null, accept)
  } catch {
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
