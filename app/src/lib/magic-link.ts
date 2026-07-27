import { supabaseService } from './supabase/service'
import { sendWhatsapp } from './whatsapp'
import { renderTemplate } from './notify'
import { siteUrl } from './site-url'

// Sign in over WhatsApp, without a second messaging provider.
//
// Supabase sends magic links over email only. Its phone channel exists but
// delivers a numeric code and requires Twilio, so adopting it would mean
// running Twilio alongside Zernio and paying both. generateLink is the way
// out: it mints the same link Supabase would have emailed and hands it back
// without sending anything, leaving delivery to us.
//
// This deliberately bypasses queueNotification. That path honors the member's
// notification matrix, and someone who muted notifications must still be able
// to log in. The row is written to the outbox afterwards for the admin panel
// and for throttling, not to decide delivery.

// One link per member per minute. Enough to stop a number being used as a
// pager, loose enough that a member who fumbles the first tap can retry.
const THROTTLE_SECONDS = 60

// Only ever redirect inside the app.
function safeNext(raw?: string | null) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null
}

export type MagicLinkResult =
  | { ok: true }
  | { ok: false; error: string }

// Callers get { ok: true } for an unknown number as well as a delivered one.
// The sign-in form is unauthenticated, so a distinguishable response would
// turn it into a way to test which phone numbers hold an account.
export async function sendWhatsappMagicLink(phone: string, next?: string | null): Promise<MagicLinkResult> {
  const db = supabaseService()
  if (!db) return { ok: false, error: 'El inicio de sesión por WhatsApp no está configurado.' }

  const { data: user } = await db
    .from('users')
    .select('id, email, display_name')
    .eq('phone_whatsapp', phone)
    .maybeSingle()
  if (!user?.email) return { ok: true }

  const since = new Date(Date.now() - THROTTLE_SECONDS * 1000).toISOString()
  const { count } = await db
    .from('notification_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('template', 'magic_link')
    .gte('created_at', since)
  if (count && count > 0) return { ok: true }

  const path = safeNext(next)
  const redirectTo = `${siteUrl()}/auth/callback${path ? `?next=${encodeURIComponent(path)}` : ''}`

  // generateLink mints the link only. Nothing is delivered until we do it.
  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
    options: { redirectTo },
  })
  const actionLink = link?.properties?.action_link
  if (linkError || !actionLink) {
    return { ok: false, error: 'No pudimos generar el enlace. Intenta de nuevo.' }
  }

  const { data: tpl } = await db
    .from('notification_templates')
    .select('body, wa_language, wa_vars, wa_status')
    .eq('channel', 'whatsapp')
    .eq('key', 'magic_link')
    .maybeSingle()
  if (!tpl) return { ok: false, error: 'Falta la plantilla de WhatsApp.' }

  // Meta only serves templates it has reviewed, and answers "Template not
  // found" for the rest. Every other send path checks this; without it here a
  // member was told to check WhatsApp for a link that was never going to
  // arrive, which locks out exactly the person trying to get in. Say so
  // instead, and point at the channel that works.
  if (tpl.wa_status !== 'approved') {
    return { ok: false, error: 'Por ahora no podemos mandarte el enlace por WhatsApp. Entra con tu correo.' }
  }

  const vars = { name: user.display_name ?? '', link: actionLink }
  const sent = await sendWhatsapp({
    to: phone,
    templateName: 'magic_link',
    language: tpl.wa_language,
    vars: (tpl.wa_vars ?? []) as string[],
    variables: vars,
    body: renderTemplate(tpl.body, vars),
  })

  // The link itself is a bearer credential for this account, so the payload
  // records that a link was sent and never the link.
  await db.from('notification_outbox').insert({
    user_id: user.id,
    channel: 'whatsapp',
    template: 'magic_link',
    payload: { requested_at: new Date().toISOString(), next: path },
    // handed to Zernio, verdict unknown until reconcileHandoffs asks
    status: sent.ok ? 'pending' : sent.skipped ? 'logged' : 'failed',
    provider_ref: sent.ok ? sent.providerRef : null,
    sent_at: null,
    error: sent.ok ? null : sent.error,
  })

  if (!sent.ok && !sent.skipped) {
    return { ok: false, error: 'No pudimos enviar el mensaje. Intenta con tu correo.' }
  }
  return { ok: true }
}
