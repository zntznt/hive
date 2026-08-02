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

export type Lang = 'es' | 'en'

// The app is written in Spanish and translated into English, so Spanish is the
// table that has to be complete. `t` falls back to it by construction: a key
// missing from `en` returns the Spanish, which is visible and fixable, rather
// than the key name, which looks like a crash.
export const HIVE_STRINGS = {
  es: {
    'tab.clubs': 'Clubes',
    'tab.events': 'Eventos',
    'tab.home': 'Inicio',
    'tab.plate': 'Pendientes',
    'tab.you': 'Tú',

    'account.title': 'Mi cuenta',
    'account.lede': 'Tu bicho, cómo entras, cómo te avisamos y cómo te pagan.',
    'account.group.you': 'Tú',
    'account.group.signin': 'Cómo entras',
    'account.group.notify': 'Cómo te avisa Hive',
    'account.group.money': 'Cómo te pagan',
    'account.group.places': 'Lugares donde puedes recibir',
    'account.group.platform': 'Plataforma',
    'account.signin.note': 'Entras con un enlace a tu correo o con un código por WhatsApp. No hay contraseñas.',
    'account.email': 'Correo',
    'account.email.none': 'sin correo',
    'account.verified': 'verificado',
    'account.name': 'Nombre visible',
    'account.photo': 'O usa tu propia foto',
    'account.photo.change': 'Cambiar foto',
    'account.photo.back': 'Volver a tu bicho',
    'account.bug.hint': 'Elige un bicho y un color para que el club te distinga a simple vista.',
    'account.photo.hint': 'Tu foto se muestra en vez de tu bicho, con el mismo recorte hexagonal.',

    'lang.label': 'Idioma',
    'lang.auto': 'Sigue tu teléfono',
    'lang.es': 'Español',
    'lang.en': 'English',

    'platform.door': 'Panel de administración',
    'platform.meta': 'cuentas y entregas',

    'saving': 'Guardando…',
    'saved': 'Listo',
  },
  en: {
    'tab.clubs': 'Clubs',
    'tab.events': 'Events',
    'tab.home': 'Home',
    'tab.plate': 'Plate',
    'tab.you': 'You',

    'account.title': 'My account',
    'account.lede': 'Your bug, how you get in, how we reach you and how you get paid.',
    'account.group.you': 'You',
    'account.group.signin': 'How you get in',
    'account.group.notify': 'How Hive reaches you',
    'account.group.money': 'How you get paid',
    'account.group.places': 'Places you can host',
    'account.group.platform': 'Platform',
    'account.signin.note': 'You get in with a link to your email or a code on WhatsApp. No passwords.',
    'account.email': 'Email',
    'account.email.none': 'no email',
    'account.verified': 'verified',
    'account.name': 'Display name',
    'account.photo': 'Or use your own photo',
    'account.photo.change': 'Change photo',
    'account.photo.back': 'Back to my bug',
    'account.bug.hint': 'Pick a bug and a colour so the club can tell everyone apart at a glance.',
    'account.photo.hint': 'Your photo shows instead of your bug, with the same hexagon crop.',

    'lang.label': 'Language',
    'lang.auto': 'Follow your phone',
    'lang.es': 'Español',
    'lang.en': 'English',

    'platform.door': 'Admin panel',
    'platform.meta': 'accounts and delivery',

    'saving': 'Saving…',
    'saved': 'Done',
  },
} as const

export type StringKey = keyof (typeof HIVE_STRINGS)['es']

// Anything starting `es` is Spanish. Everything else is English, including
// languages we do not have: whole-language fallback is the point.
export function langOf(tag: string | null | undefined): Lang {
  return tag && tag.toLowerCase().startsWith('es') ? 'es' : 'en'
}

// The server's read. `Accept-Language` is the phone's setting as the browser
// reports it, and the override beats it because somebody went and chose.
export function resolveLang(override: string | null | undefined, acceptLanguage: string | null | undefined): Lang {
  if (override === 'es' || override === 'en') return override
  const first = acceptLanguage?.split(',')[0]?.trim()
  return langOf(first)
}

// The browser's read, for client components that have no server context.
export function browserLang(override?: string | null): Lang {
  if (override === 'es' || override === 'en') return override
  if (typeof navigator === 'undefined') return 'es'
  return langOf(navigator.language)
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
