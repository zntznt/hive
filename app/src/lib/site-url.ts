// The app answers on more than one Vercel alias, so "where am I" is not a
// safe thing to infer from the current request. One canonical origin is
// declared here and used for everything that leaves the app: magic-link
// redirects, and links inside emails and WhatsApp messages.
//
// Auth is the reason this matters. Supabase only honors a redirect that is on
// its allow-list, and falls back to the project's Site URL otherwise, so a
// sign-in started on the wrong alias lands somewhere else. Worse, the PKCE
// code verifier is stored per origin, so that sign-in then fails outright with
// "Email link is invalid or has expired". Pinning the origin removes both.
//
// NEXT_PUBLIC_SITE_URL overrides it, for a custom domain later.
export const CANONICAL_ORIGIN = normalize(
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://hive-cofre.vercel.app'
)

function isLocal(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

// Absolute origin for links we put inside emails and WhatsApp messages.
// A relative path is fine inside the app but useless in a message, since
// there is nothing to tap.
export function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL?.trim()) return CANONICAL_ORIGIN
  // Local dev has no business linking people at production.
  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  return CANONICAL_ORIGIN
}

// Origin to hand Supabase as the magic-link destination. Deployments always
// use the canonical one, whichever alias the member happened to open. Local
// dev keeps its own origin, since sending a developer to production mid
// sign-in would be useless (and their code verifier lives on localhost).
export function authOrigin() {
  if (typeof window !== 'undefined' && isLocal(window.location.hostname)) {
    return window.location.origin
  }
  return CANONICAL_ORIGIN
}

// Vercel gives a bare hostname; a hand-set variable may carry a protocol
// and a trailing slash. Accept either and emit one canonical form.
function normalize(raw: string) {
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withProtocol.replace(/\/+$/, '')
}
