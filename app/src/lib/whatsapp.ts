// Thin fetch-based Zernio client, same shape as email.ts: no SDK, one POST,
// config from env. Returns {skipped:true} when unconfigured so the outbox
// records "logged" instead of "failed" and nothing breaks in production.
//
// Zernio has no single transactional "send template to this number" call.
// The documented route to a number that has never messaged us first is a
// broadcast: create it with the template, attach the recipient, send it.
// Three calls per notification is heavy, but at this app's volume (tens of
// messages a week) it costs nothing and keeps us on a supported path.
const BASE = process.env.ZERNIO_API_BASE || 'https://zernio.com/api/v1'

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

async function call(apiKey: string, path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) throw new Error(`Zernio ${res.status} en ${path}: ${text.slice(0, 300)}`)
  try {
    return JSON.parse(text) as Record<string, never>
  } catch {
    return {} as Record<string, never>
  }
}

// Hive bodies read better with named placeholders; Meta only understands
// positional ones. Returns the rewritten text plus the names in the order
// they first appear, which becomes notification_templates.wa_vars.
export function toPositional(body: string) {
  const vars: string[] = []
  const text = body.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    let i = vars.indexOf(name)
    if (i === -1) i = vars.push(name) - 1
    return `{{${i + 1}}}`
  })
  return { text, vars }
}

// Submits a template for Meta review. Approval is not instant (hours to
// days), so callers store the returned status rather than assuming success.
export async function createWhatsappTemplate({
  name,
  language,
  body,
}: {
  name: string
  language: string
  body: string
}): Promise<{ ok: true; status: string; vars: string[] } | { ok: false; error: string }> {
  const cfg = config()
  if (!cfg) return { ok: false, error: 'Zernio no está configurado' }

  const { text, vars } = toPositional(body)
  try {
    const created = await call(cfg.apiKey, '/whatsapp/templates', {
      method: 'POST',
      body: {
        accountId: cfg.accountId,
        name,
        language,
        category: 'UTILITY',
        components: [
          {
            type: 'BODY',
            text,
            // Meta requires sample values for every placeholder
            ...(vars.length ? { example: { body_text: [vars.map((v) => v)] } } : {}),
          },
        ],
      },
    })
    const tpl = (created.template ?? created) as { status?: string }
    return { ok: true, status: String(tpl.status ?? 'pending').toLowerCase(), vars }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido de Zernio' }
  }
}

export async function listWhatsappTemplates(): Promise<
  { ok: true; templates: { name: string; status: string; language: string }[] } | { ok: false; error: string }
> {
  const cfg = config()
  if (!cfg) return { ok: false, error: 'Zernio no está configurado' }
  try {
    const res = await call(cfg.apiKey, `/whatsapp/templates?accountId=${cfg.accountId}`)
    const raw = (res.templates ?? res.data ?? []) as unknown
    const list = Array.isArray(raw) ? (raw as Record<string, string>[]) : []
    return {
      ok: true,
      templates: list.map((t) => ({
        name: String(t.name ?? ''),
        status: String(t.status ?? '').toLowerCase(),
        language: String(t.language ?? ''),
      })),
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido de Zernio' }
  }
}

export async function sendWhatsapp({
  to,
  templateName,
  language = 'es_MX',
  vars,
  variables,
  body,
}: {
  to: string
  templateName: string
  language?: string
  // ordered placeholder names, from notification_templates.wa_vars
  vars: string[]
  variables: Record<string, string>
  body: string
}): Promise<Result> {
  const cfg = config()
  if (!cfg) {
    return { ok: false, skipped: true, error: 'Zernio no está configurado' }
  }

  try {
    const created = await call(cfg.apiKey, '/broadcasts', {
      method: 'POST',
      body: {
        profileId: cfg.profileId,
        accountId: cfg.accountId,
        platform: 'whatsapp',
        name: `hive-${templateName}-${Date.now()}`,
        template: {
          name: templateName,
          language,
          // positional, in the order the template was submitted
          parameters: vars.map((v) => variables[v] ?? ''),
        },
        message: { text: body },
      },
    })

    // the id comes back nested under `broadcast`, not at the top level
    const broadcast = (created.broadcast ?? created.data ?? created) as { id?: string; _id?: string }
    const id = broadcast.id ?? broadcast._id
    if (typeof id !== 'string') {
      return {
        ok: false,
        skipped: false,
        error: `Zernio no devolvió un id de broadcast: ${JSON.stringify(created).slice(0, 200)}`,
      }
    }

    await call(cfg.apiKey, `/broadcasts/${id}/recipients`, { method: 'POST', body: { recipients: [{ phone: to }] } })
    await call(cfg.apiKey, `/broadcasts/${id}/send`, { method: 'POST', body: {} })
    return { ok: true }
  } catch (e) {
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : 'Error desconocido de Zernio' }
  }
}
