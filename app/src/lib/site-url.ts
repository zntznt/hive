// Absolute origin for links we put inside emails and WhatsApp messages.
//
// A relative path is fine inside the app but useless in a message, since
// there is nothing to tap. So this always returns a real origin, and it
// works with no setup:
// Vercel exposes VERCEL_PROJECT_PRODUCTION_URL on every deployment, which is
// what we want even when a preview deploy sends the message, since the
// recipient should land on production rather than on a preview that will
// disappear. NEXT_PUBLIC_SITE_URL still wins when set, for a custom domain.
export function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return normalize(explicit)

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return normalize(vercel)

  return 'http://localhost:3000'
}

// Vercel gives a bare hostname; a hand-set variable may carry a protocol
// and a trailing slash. Accept either and emit one canonical form.
function normalize(raw: string) {
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withProtocol.replace(/\/+$/, '')
}
