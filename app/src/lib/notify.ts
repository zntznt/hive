import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from './email'
import { sendWhatsapp, checkBroadcast } from './whatsapp'
import { supabaseService } from './supabase/service'
import { after } from 'next/server'

// Every function here reads rows that belong to other people: the recipient's
// preferences, their queued outbox rows, the shared template CMS. RLS scopes
// all three to yourself or to app admins, so the pipeline has to run on its
// own credentials rather than the acting user's. Falls back to the caller's
// client when the service key is unset, which is the old (broken) behavior
// but keeps the app running.
function pipelineDb(supabase: SupabaseClient): SupabaseClient {
  return supabaseService() ?? supabase
}

export type TemplateKey =
  | 'waitlist_promoted'
  | 'event_today'
  // sign-in link over WhatsApp. Deliberately absent from TOPIC_OF: logging in
  // is not a notification anyone should be able to mute.
  | 'magic_link'
  | 'invitation'
  | 'change_request_approved'
  | 'change_request_declined'
  | 'join_request_approved'
  | 'join_request_declined'
  | 'new_event'
  | 'rsvp_pending'
  | 'payment_received'
  | 'payment_confirmed'

// The Account page's notification matrix rows. Every topic maps 1:n to the
// template keys above; a template without a topic follows the old global
// notif_email/notif_whatsapp columns.
export type NotifTopic = 'new_event' | 'reminders' | 'rsvp_waitlist' | 'payments' | 'approvals'

export const TOPIC_OF: Partial<Record<TemplateKey, NotifTopic>> = {
  new_event: 'new_event',
  event_today: 'reminders',
  waitlist_promoted: 'rsvp_waitlist',
  rsvp_pending: 'rsvp_waitlist',
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

// Queues notification_outbox rows. Channels come from the recipient's
// per-topic matrix (users.notif_prefs) when the template maps to a topic,
// falling back to the global notif_email/notif_whatsapp toggles; a fully
// opted-out topic queues nothing at all.
//
// Both channels can fire for the same notification: ticking WhatsApp used to
// be inert because email was checked first and wins by default, so a member
// who asked for WhatsApp silently kept getting email only. Each enabled
// channel now gets its own row. A channel with nowhere to deliver (WhatsApp
// without a linked number, email without an address) is skipped, and if that
// leaves nothing at all we fall back to whichever address does exist, so
// opting into WhatsApp before linking a number never means silence.
// Call dispatchQueuedNotifications right after to actually send instead of
// leaving rows queued indefinitely.
export async function queueNotification(
  supabase: SupabaseClient,
  { userId, template, vars }: { userId: string; template: TemplateKey; vars: Record<string, string> }
) {
  const db = pipelineDb(supabase)
  const { data: user } = await db
    .from('users')
    .select('email, phone_whatsapp, notif_email, notif_whatsapp, notif_prefs')
    .eq('id', userId)
    .maybeSingle()

  const topic = TOPIC_OF[template]
  const pref = topic ? ((user?.notif_prefs ?? {}) as PrefsMatrix)[topic] : undefined
  const emailOn = pref?.email ?? user?.notif_email ?? true
  const whatsappOn = pref?.whatsapp ?? user?.notif_whatsapp ?? false
  if (!emailOn && !whatsappOn) return

  const channels: ('email' | 'whatsapp')[] = []
  if (emailOn && user?.email) channels.push('email')
  if (whatsappOn && user?.phone_whatsapp) channels.push('whatsapp')
  if (!channels.length) {
    if (user?.email) channels.push('email')
    else if (user?.phone_whatsapp) channels.push('whatsapp')
    else return
  }

  await db
    .from('notification_outbox')
    .insert(channels.map((channel) => ({ user_id: userId, channel, template, payload: vars })))
}

// Direct send against a CMS template, for recipients who don't have a
// `users` row yet (invitations) - so it can't go through the outbox, whose
// user_id is a hard FK. Same template source as the queued path, so editing
// the "invitation" template in the admin CMS covers both.
export async function sendTemplatedEmail(
  supabase: SupabaseClient,
  { to, template, vars }: { to: string; template: TemplateKey; vars: Record<string, string> }
) {
  const { data: tpl } = await pipelineDb(supabase).from('notification_templates').select('*').eq('channel', 'email').eq('key', template).maybeSingle()
  if (!tpl) return { ok: false as const, skipped: true as const, error: 'sin plantilla' }
  const subject = renderTemplate(tpl.subject ?? 'Hive', vars)
  const html = renderTemplate(tpl.body, vars).replace(/\n/g, '<br>')
  return sendEmail({ to, subject, html })
}

// The WhatsApp twin of sendTemplatedEmail, for the same reason: an invitee
// has no `users` row yet and notification_outbox.user_id is a hard FK, so
// this cannot go through the outbox. The cost is that invitations are the one
// thing the admin log cannot show, on either channel.
//
// Meta only delivers templates it has reviewed, and the dispatcher checks
// that before sending. This path has no dispatcher, so it checks here.
export async function sendTemplatedWhatsapp(
  supabase: SupabaseClient,
  { to, template, vars }: { to: string; template: TemplateKey; vars: Record<string, string> }
) {
  const { data: tpl } = await pipelineDb(supabase)
    .from('notification_templates')
    .select('*')
    .eq('channel', 'whatsapp')
    .eq('key', template)
    .maybeSingle()
  if (!tpl) return { ok: false as const, skipped: true as const, error: 'sin plantilla' }
  if (tpl.wa_status !== 'approved') {
    return { ok: false as const, skipped: true as const, error: 'plantilla de WhatsApp sin aprobar' }
  }
  return sendWhatsapp({
    to,
    templateName: template,
    language: tpl.wa_language ?? 'es_MX',
    vars: (tpl.wa_vars ?? []) as string[],
    variables: vars,
    body: renderTemplate(tpl.body, vars),
  })
}

// Pulls queued rows (small table at this app's scale, no worker needed) and
// sends each one on its own channel: Resend for email, Zernio for WhatsApp.
// Either provider being unconfigured marks the row 'logged' rather than
// 'failed', so a half-configured install degrades quietly instead of
// filling the admin panel with red.
export async function dispatchQueuedNotifications(supabase: SupabaseClient, limit = 20) {
  const db = pipelineDb(supabase)
  const { data: rows } = await db
    .from('notification_outbox')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (!rows?.length) return

  for (const row of rows) {
    const channel = row.channel as 'email' | 'whatsapp'
    const [{ data: tpl }, { data: user }] = await Promise.all([
      db.from('notification_templates').select('*').eq('channel', channel).eq('key', row.template).maybeSingle(),
      db.from('users').select('email, phone_whatsapp, display_name, notif_prefs').eq('id', row.user_id).maybeSingle(),
    ])

    const destination = channel === 'email' ? user?.email : user?.phone_whatsapp
    if (!tpl || !user || !destination) {
      const missing = channel === 'email' ? 'sin correo registrado' : 'sin número de WhatsApp'
      await db
        .from('notification_outbox')
        .update({ status: 'logged', error: !tpl ? 'sin plantilla' : missing })
        .eq('id', row.id)
      continue
    }

    // rows queued outside queueNotification (the waitlist RPC) still honor
    // the recipient's Account matrix at send time
    const topic = TOPIC_OF[row.template as TemplateKey]
    const pref = topic ? ((user.notif_prefs ?? {}) as PrefsMatrix)[topic] : undefined
    if (pref?.[channel] === false) {
      await db
        .from('notification_outbox')
        .update({ status: 'logged', error: 'silenciado por preferencias' })
        .eq('id', row.id)
      continue
    }

    // Meta only delivers templates it has reviewed, so an unsubmitted or
    // still-pending one would fail on every send. Say so once, in the words
    // the admin panel uses, instead of collecting provider errors.
    if (channel === 'whatsapp' && tpl.wa_status !== 'approved') {
      await db
        .from('notification_outbox')
        .update({ status: 'logged', error: 'plantilla de WhatsApp sin aprobar' })
        .eq('id', row.id)
      continue
    }

    const vars = { name: user.display_name, ...(row.payload as Record<string, string>) }
    const body = renderTemplate(tpl.body, vars)
    const result =
      channel === 'email'
        ? await sendEmail({
            to: destination,
            subject: renderTemplate(tpl.subject ?? 'Hive', vars),
            html: body.replace(/\n/g, '<br>'),
          })
        : await sendWhatsapp({
            to: destination,
            templateName: row.template,
            language: tpl.wa_language ?? 'es_MX',
            vars: (tpl.wa_vars ?? []) as string[],
            variables: vars,
            body,
          })

    // A WhatsApp send is a handoff, not a delivery: Zernio takes about ten
    // seconds to learn what Meta decided. The row records the broadcast id and
    // parks in 'pending' so reconcileHandoffs can ask later. Crucially
    // 'pending' is not 'queued', so a row whose verdict never arrives is never
    // sent a second time. Email is synchronous and still settles here.
    const handedOff = result.ok && 'providerRef' in result
    await db
      .from('notification_outbox')
      .update(
        result.ok
          ? handedOff
            ? { status: 'pending', provider_ref: result.providerRef, error: null }
            : { status: 'sent', sent_at: new Date().toISOString(), error: null }
          : { status: result.skipped ? 'logged' : 'failed', error: result.error }
      )
      .eq('id', row.id)
  }
}

// Asks the provider what became of sends we handed over earlier. Runs before
// each dispatch and from the daily cron, so a verdict lands within seconds in
// normal use and within a day at worst. Rows with no verdict yet are simply
// left alone and asked again next time.
export async function reconcileHandoffs(supabase: SupabaseClient, limit = 15) {
  const db = pipelineDb(supabase)
  const { data: rows } = await db
    .from('notification_outbox')
    .select('id, provider_ref')
    .eq('status', 'pending')
    .not('provider_ref', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (!rows?.length) return

  for (const row of rows) {
    const verdict = await checkBroadcast(row.provider_ref as string)
    if (verdict.state === 'pending') continue
    await db
      .from('notification_outbox')
      .update(
        verdict.state === 'sent'
          ? { status: 'sent', sent_at: new Date().toISOString(), error: null }
          : { status: 'failed', error: verdict.reason }
      )
      .eq('id', row.id)
  }
}

// Sending is not part of the member's request, so it should not be in front of
// their next screen. Each WhatsApp recipient costs three sequential calls to
// Zernio, so a twenty-person club had the organizer waiting on sixty round
// trips before the page moved. after() hands the response back first and runs
// the dispatch once it is out the door, including when the action finished by
// calling redirect(). Errors are swallowed on purpose: nothing is listening
// any more, and every row already carries its own status and error.
export function dispatchAfterResponse(supabase: SupabaseClient, limit = 20) {
  after(async () => {
    try {
      // resolve the previous batch's handoffs before adding to the pile
      await reconcileHandoffs(supabase)
      await dispatchQueuedNotifications(supabase, limit)
    } catch (e) {
      console.error('[notify] dispatch tras la respuesta falló', e)
    }
  })
}
