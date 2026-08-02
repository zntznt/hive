// Language, resolved once, for every surface.
//
// Two rules and they are both about not being clever:
//
// The fallback is WHOLE-LANGUAGE, never per-string. A phone set to Italian
// gets English. It does not get an Italian shell with Spanish rows in it,
// which is what per-key fallback produces the moment one key is missing.
//
// Copy is computed at RENDER, never at module load. A string in a
// module-level `const` freezes whichever language loaded first and then never
// follows the toggle, which is a bug that only shows up for the second person
// to use the app on that server.

import { ES, EN } from './strings'

export type Lang = 'es' | 'en'

// Which languages the string table actually covers, end to end.
//
// This is the gate the whole-language rule needs. A language listed here has
// every screen written in it; a language not listed is never resolved to and
// never offered, so nobody can land in a half-translated app. English sat
// outside this list for one commit while the copy was written, and the first
// screenshot after the harness was repaired is what showed why: a translated
// tab bar over Spanish rows reads as a rendering fault, not a missing
// translation.
//
// Both are in now. Adding a third means writing every key in strings.ts for
// it, and nothing else.
export const COMPLETE_LANGS: Lang[] = ['es', 'en']

// The language we will actually render in. A language we have not finished is
// not a language we may pick.
function complete(lang: Lang): Lang {
  return COMPLETE_LANGS.includes(lang) ? lang : COMPLETE_LANGS[0]
}

// The app is written in Spanish and translated into English, so Spanish is the
// table that has to be complete. `t` falls back to it by construction: a key
// missing from `en` returns the Spanish, which is visible and fixable, rather
// than the key name, which looks like a crash.
export const HIVE_STRINGS = {
  es: ES,
  en: EN,
} as const

export type StringKey = keyof typeof ES

// Anything starting `es` is Spanish. Everything else is English, including
// languages we do not have: whole-language fallback is the point.
export function langOf(tag: string | null | undefined): Lang {
  return tag && tag.toLowerCase().startsWith('es') ? 'es' : 'en'
}

// The server's read. `Accept-Language` is the phone's setting as the browser
// reports it, and the override beats it because somebody went and chose.
export function resolveLang(override: string | null | undefined, acceptLanguage: string | null | undefined): Lang {
  if (override === 'es' || override === 'en') return complete(override)
  const first = acceptLanguage?.split(',')[0]?.trim()
  return complete(langOf(first))
}

// The browser's read, for client components that have no server context.
export function browserLang(override?: string | null): Lang {
  if (override === 'es' || override === 'en') return complete(override)
  if (typeof navigator === 'undefined') return 'es'
  return complete(langOf(navigator.language))
}

export function t(lang: Lang, key: StringKey): string {
  const table = HIVE_STRINGS[lang] as Record<string, string>
  return table[key] ?? (HIVE_STRINGS.es as Record<string, string>)[key] ?? key
}

// Whole sentences live in the table, so this only ever fills slots in one.
// Spanish reorders them ("Le debes $9.50 a Rocío"), which is why a sentence
// assembled from translated fragments is always wrong in one language or the
// other.
export function tf(lang: Lang, key: StringKey, vals: Record<string, string | number>): string {
  return t(lang, key).replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''))
}
