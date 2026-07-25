// WhatsApp needs E.164. Members type their number however they like
// ("55 1234 5678", "044 55...", "+52 55 1234 5678"), so normalize to +52
// plus ten digits before it ever reaches the provider or the database.
// Mexico is the default country; anything already carrying a different
// country code is kept as typed.
const MX = '52'

export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null

  // international prefixes people paste from other apps
  digits = digits.replace(/^00/, '')
  // "044"/"045" were the old domestic long-distance prefixes for mobiles
  digits = digits.replace(/^0(?:44|45)/, '')

  if (digits.length === 10) return `+${MX}${digits}`
  if (digits.startsWith(MX)) {
    // +521XXXXXXXXXX is the legacy mobile form; Meta expects the 1 dropped
    const rest = digits.slice(2).replace(/^1(?=\d{10}$)/, '')
    return rest.length === 10 ? `+${MX}${rest}` : null
  }
  // some other country, trust it if it looks like a plausible E.164 body
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
}

// "+525512345678" -> "+52 55 1234 5678", for display only
export function formatPhone(e164: string): string {
  const m = /^\+52(\d{2})(\d{4})(\d{4})$/.exec(e164)
  return m ? `+52 ${m[1]} ${m[2]} ${m[3]}` : e164
}
