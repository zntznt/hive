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

// Why the send failed, in Meta's own words. The broadcast record itself only
// carries a count, but each recipient row carries the real reason, and that
// distinction cost hours: a parameter-shape bug of ours sat behind an error
// message that blamed business verification, so we went looking at Meta
// instead of at our own payload. Never guess a cause the provider will tell
// you if asked.
async function failureReason(apiKey: string, id: string): Promise<string | null> {
  try {
    const res = await call(apiKey, `/broadcasts/${id}/recipients`)
    const list = (res.recipients ?? []) as unknown as { status?: string; error?: string }[]
    const failed = list.find((r) => r.status === 'failed' && r.error)
    return failed?.error ?? null
  } catch {
    return null
  }
}

// Polls a broadcast until it stops moving. Returns 'failed' only when Meta
// actually rejected it; an inconclusive poll returns 'pending' and the caller
// treats it as sent, so a slow broadcast is never reported as a failure.
async function settled(apiKey: string, id: string): Promise<'failed' | 'done' | 'pending'> {
  for (const wait of [600, 900, 1400, 2000]) {
    await new Promise((r) => setTimeout(r, wait))
    try {
      const res = await call(apiKey, `/broadcasts/${id}`)
      const b = (res.broadcast ?? res) as unknown as { status?: string; failedCount?: number; sentCount?: number }
      const status = String(b.status ?? '')
      if (status === 'failed') return 'failed'
      if (status === 'completed' || status === 'sent') {
        return (b.failedCount ?? 0) > 0 && (b.sentCount ?? 0) === 0 ? 'failed' : 'done'
      }
    } catch {
      // a failed status read is not a failed send
      return 'pending'
    }
  }
  return 'pending'
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
          // Meta's own component shape, which is the only one Zernio keeps.
          // A flat `parameters` array (or a `variables` array) is accepted
          // with a 200 and then silently stored as components: [], so the
          // send reaches Meta carrying no variables at all and is rejected
          // with "Template parameter count mismatch".
          components: [
            {
              type: 'body',
              // positional, in the order the template was submitted
              parameters: vars.map((v) => ({ type: 'text', text: variables[v] ?? '' })),
            },
          ],
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

    // Zernio wants a bare `phones` array here. A `recipients` array of
    // {phone} objects is rejected with "Either contactIds array, phones
    // array, or useSegment: true is required", which is what every WhatsApp
    // notification failed on until now.
    await call(cfg.apiKey, `/broadcasts/${id}/recipients`, { method: 'POST', body: { phones: [to] } })
    await call(cfg.apiKey, `/broadcasts/${id}/send`, { method: 'POST', body: {} })

    // /send only means Zernio accepted the job. Meta can still refuse, and
    // does: it blocks business-initiated conversations while the business is
    // unverified or its payment method is failing, which is invisible here
    // unless we look. The broadcast resolves in about a second, so wait for a
    // verdict rather than reporting a send that never happened. Dispatch runs
    // after the response now, so these seconds cost the member nothing.
    const verdict = await settled(cfg.apiKey, id)
    if (verdict === 'failed') {
      const reason = await failureReason(cfg.apiKey, id)
      return {
        ok: false,
        skipped: false,
        error: reason
          ? `WhatsApp rechazó el envío: ${reason} (broadcast ${id})`
          : `WhatsApp rechazó el envío sin dar motivo (broadcast ${id})`,
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : 'Error desconocido de Zernio' }
  }
}
