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
  // the broadcast was handed over; whether Meta accepts it is not known yet
  | { ok: true; providerRef: string }
  | { ok: false; skipped: true; error: string }
  | { ok: false; skipped: false; error: string }

// What Zernio says about a broadcast we already handed over.
export type BroadcastVerdict =
  | { state: 'sent' }
  | { state: 'failed'; reason: string }
  | { state: 'pending' }

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

// fetch has no default timeout, so a provider that never answers holds the
// request until the platform kills the whole invocation, which is how a
// sign-in once sat on "Enviando…" with nothing to read.
//
// The bound has to clear the real cost of the call, not the cost we wish it
// had: creating a broadcast measured 7.3 seconds against a healthy Zernio, so
// a six second limit was cancelling work that was about to succeed. This is a
// guard against a provider that has stopped answering, not a latency budget.
const CALL_TIMEOUT_MS = 20000

async function call(apiKey: string, path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? 'GET',
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
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

// One look at a broadcast we already handed over. Anything short of a clear
// verdict stays 'pending' and gets asked again later, so a slow broadcast is
// never recorded as a failure and a status read that itself errors is not
// treated as one either.
export async function checkBroadcast(id: string): Promise<BroadcastVerdict> {
  const cfg = config()
  if (!cfg) return { state: 'pending' }
  try {
    const res = await call(cfg.apiKey, `/broadcasts/${id}`)
    const b = (res.broadcast ?? res) as unknown as { status?: string; failedCount?: number; sentCount?: number }
    const status = String(b.status ?? '')
    const failed = b.failedCount ?? 0
    const sent = b.sentCount ?? 0

    if (status === 'failed' || (failed > 0 && sent === 0)) {
      const reason = await failureReason(cfg.apiKey, id)
      return { state: 'failed', reason: reason ?? 'WhatsApp no dio un motivo' }
    }
    if (status === 'completed' || status === 'sent') return { state: 'sent' }
    return { state: 'pending' }
  } catch {
    return { state: 'pending' }
  }
}

export async function sendWhatsapp({
  to,
  templateName,
  language = 'es_MX',
  vars,
  variables,
  body,
  otpCode,
}: {
  to: string
  templateName: string
  language?: string
  // ordered placeholder names, from notification_templates.wa_vars
  vars: string[]
  variables: Record<string, string>
  body: string
  // AUTHENTICATION templates carry the code twice: once in the body Meta
  // wrote, and once in the copy-code button so it can be tapped rather than
  // retyped. Both have to be sent or the button copies nothing.
  otpCode?: string
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
              parameters: otpCode
                ? [{ type: 'text', text: otpCode }]
                : vars.map((v) => ({ type: 'text', text: variables[v] ?? '' })),
            },
            ...(otpCode
              ? [
                  {
                    type: 'button',
                    sub_type: 'copy_code',
                    index: '0',
                    parameters: [{ type: 'coupon_code', coupon_code: otpCode }],
                  },
                ]
              : []),
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

    // Deliberately not waiting for the outcome. A broadcast takes about ten
    // seconds to resolve, which is longer than the function is allowed to
    // live, and blocking on it got an invocation killed after the message had
    // gone out but before the row was updated. Hand back the id instead and
    // let checkBroadcast decide later.
    return { ok: true, providerRef: id }
  } catch (e) {
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : 'Error desconocido de Zernio' }
  }
}
