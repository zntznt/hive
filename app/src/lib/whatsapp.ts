// Thin fetch-based Zernio client, same shape as email.ts: no SDK, one POST,
// config from env. Returns {skipped:true} when unconfigured so the outbox
// records "logged" instead of "failed" and nothing breaks in production.
//
// Zernio has no single transactional "send template to this number" call.
// The documented route to a number that has never messaged us first is a
// broadcast: create it with the template, attach the recipient, send it.
// Three calls per notification is heavy, but at this app's volume (tens of
// messages a week) it costs nothing and keeps us on a supported path.
//
// The template payload shape below has not been checked against a live
// account yet, so failures record the provider's verbatim response in
// notification_outbox.error where the admin panel can show it.
const BASE = process.env.ZERNIO_API_BASE || 'https://zernio.com/api/v1'

type SendArgs = {
  to: string
  templateName: string
  language?: string
  variables: Record<string, string>
  body: string
}

type Result =
  | { ok: true }
  | { ok: false; skipped: true; error: string }
  | { ok: false; skipped: false; error: string }

function config() {
  const apiKey = process.env.ZERNIO_API_KEY
  const profileId = process.env.ZERNIO_PROFILE_ID
  const accountId = process.env.ZERNIO_ACCOUNT_ID
  if (!apiKey || !profileId || !accountId) return null
  return { apiKey, profileId, accountId }
}

export function whatsappConfigured() {
  return config() !== null
}

async function call(cfg: { apiKey: string }, path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) throw new Error(`Zernio ${res.status} en ${path}: ${text.slice(0, 300)}`)
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {} as Record<string, unknown>
  }
}

export async function sendWhatsapp({ to, templateName, language = 'es_MX', variables, body }: SendArgs): Promise<Result> {
  const cfg = config()
  if (!cfg) {
    return { ok: false, skipped: true, error: 'Zernio no está configurado' }
  }

  try {
    const created = await call(cfg, '/broadcasts', {
      profileId: cfg.profileId,
      accountId: cfg.accountId,
      platform: 'whatsapp',
      name: `hive-${templateName}-${to}`,
      template: { name: templateName, language, variables },
      message: { text: body },
    })

    const id = created.id ?? (created.data as Record<string, unknown> | undefined)?.id
    if (typeof id !== 'string') {
      return { ok: false, skipped: false, error: `Zernio no devolvió un id de broadcast: ${JSON.stringify(created).slice(0, 200)}` }
    }

    await call(cfg, `/broadcasts/${id}/recipients`, { recipients: [{ phone: to }] })
    await call(cfg, `/broadcasts/${id}/send`, {})
    return { ok: true }
  } catch (e) {
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : 'Error desconocido de Zernio' }
  }
}
