import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from './email'

export type TemplateKey =
  | 'waitlist_promoted'
  | 'invitation'
  | 'change_request_approved'
  | 'change_request_declined'
  | 'join_request_approved'
  | 'join_request_declined'
  | 'new_event'
  | 'payment_received'
  | 'payment_confirmed'

// The Account page's notification matrix rows. Every topic maps 1:n to the
// template keys above; a template without a topic follows the old global
// notif_email/notif_whatsapp columns.
export type NotifTopic = 'new_event' | 'rsvp_waitlist' | 'payments' | 'approvals'

export const TOPIC_OF: Partial<Record<TemplateKey, NotifTopic>> = {
  new_event: 'new_event',
  waitlist_promoted: 'rsvp_waitlist',
  payment_received: 'payments',
  payment_confirmed: 'payments',
  change_request_approved: 'approvals',
  change_request_declined: 'approvals',
  join_request_approved: 'approvals',
  join_request_declined: 'approvals',
}

type PrefsMatrix = Partial<Record<NotifTopic, { email?: boolean; whatsapp?: boolean }>>

export function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

// Queues a notification_outbox row. The channel comes from the recipient's
// per-topic matrix (users.notif_prefs) when the template maps to a topic,
// falling back to the global notif_email/notif_whatsapp toggles; a fully
// opted-out topic queues nothing at all. WhatsApp rows just log today since
// no provider is connected. Call dispatchQueuedNotifications right after to
// actually send instead of leaving rows queued indefinitely.
export async function queueNotification(
  supabase: SupabaseClient,
  { userId, template, vars }: { userId: string; template: TemplateKey; vars: Record<string, string> }
) {
  const { data: user } = await supabase
    .from('users')
    .select('notif_email, notif_whatsapp, notif_prefs')
    .eq('id', userId)
    .maybeSingle()

  const topic = TOPIC_OF[template]
  const pref = topic ? ((user?.notif_prefs ?? {}) as PrefsMatrix)[topic] : undefined
  const emailOn = pref?.email ?? user?.notif_email ?? true
  const whatsappOn = pref?.whatsapp ?? user?.notif_whatsapp ?? false

  const channel = emailOn ? 'email' : whatsappOn ? 'whatsapp' : null
  if (!channel) return
  await supabase.from('notification_outbox').insert({ user_id: userId, channel, template, payload: vars })
}

// Direct send against a CMS template, for recipients who don't have a
// `users` row yet (invitations) - so it can't go through the outbox, whose
// user_id is a hard FK. Same template source as the queued path, so editing
// the "invitation" template in the admin CMS covers both.
export async function sendTemplatedEmail(
  supabase: SupabaseClient,
  { to, template, vars }: { to: string; template: TemplateKey; vars: Record<string, string> }
) {
  const { data: tpl } = await supabase.from('notification_templates').select('*').eq('channel', 'email').eq('key', template).maybeSingle()
  if (!tpl) return { ok: false as const, skipped: true as const, error: 'sin plantilla' }
  const subject = renderTemplate(tpl.subject ?? 'Hive', vars)
  const html = renderTemplate(tpl.body, vars).replace(/\n/g, '<br>')
  return sendEmail({ to, subject, html })
}

// Pulls queued rows (small table at this app's scale, no worker needed) and
// actually sends the email ones via Resend; whatsapp rows are marked
// 'logged' since no provider is wired up yet - flipping that on later is
// just adding a sendWhatsapp() branch here, the CMS/templates are ready.
export async function dispatchQueuedNotifications(supabase: SupabaseClient, limit = 20) {
  const { data: rows } = await supabase
    .from('notification_outbox')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (!rows?.length) return

  for (const row of rows) {
    if (row.channel === 'whatsapp') {
      await supabase
        .from('notification_outbox')
        .update({ status: 'logged', error: 'WhatsApp no está conectado todavía' })
        .eq('id', row.id)
      continue
    }

    const [{ data: tpl }, { data: user }] = await Promise.all([
      supabase.from('notification_templates').select('*').eq('channel', row.channel).eq('key', row.template).maybeSingle(),
      supabase.from('users').select('email, display_name, notif_prefs').eq('id', row.user_id).maybeSingle(),
    ])

    if (!tpl || !user?.email) {
      await supabase
        .from('notification_outbox')
        .update({ status: 'logged', error: !tpl ? 'sin plantilla' : 'sin correo registrado' })
        .eq('id', row.id)
      continue
    }

    // rows queued outside queueNotification (the waitlist RPC) still honor
    // the recipient's Account matrix at send time
    const topic = TOPIC_OF[row.template as TemplateKey]
    const pref = topic ? ((user.notif_prefs ?? {}) as PrefsMatrix)[topic] : undefined
    if (pref?.email === false) {
      await supabase
        .from('notification_outbox')
        .update({ status: 'logged', error: 'silenciado por preferencias' })
        .eq('id', row.id)
      continue
    }

    const vars = { name: user.display_name, ...(row.payload as Record<string, string>) }
    const subject = renderTemplate(tpl.subject ?? 'Hive', vars)
    const html = renderTemplate(tpl.body, vars).replace(/\n/g, '<br>')
    const result = await sendEmail({ to: user.email, subject, html })

    await supabase
      .from('notification_outbox')
      .update(
        result.ok
          ? { status: 'sent', sent_at: new Date().toISOString(), error: null }
          : { status: result.skipped ? 'logged' : 'failed', error: result.error }
      )
      .eq('id', row.id)
  }
}
