import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from './email'

export type TemplateKey =
  | 'waitlist_promoted'
  | 'invitation'
  | 'change_request_approved'
  | 'change_request_declined'
  | 'join_request_approved'
  | 'join_request_declined'

export function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

// Queues a notification_outbox row (channel picked per the recipient's own
// prefs: email if they opted in, else whatsapp - which just logs today since
// no provider is connected). Call dispatchQueuedNotifications right after to
// actually send it instead of leaving it queued indefinitely.
export async function queueNotification(
  supabase: SupabaseClient,
  { userId, template, vars }: { userId: string; template: TemplateKey; vars: Record<string, string> }
) {
  const { data: user } = await supabase.from('users').select('notif_email, notif_whatsapp').eq('id', userId).maybeSingle()
  const channel = user?.notif_email === false && user?.notif_whatsapp ? 'whatsapp' : 'email'
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
      supabase.from('users').select('email, display_name').eq('id', row.user_id).maybeSingle(),
    ])

    if (!tpl || !user?.email) {
      await supabase
        .from('notification_outbox')
        .update({ status: 'logged', error: !tpl ? 'sin plantilla' : 'sin correo registrado' })
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
