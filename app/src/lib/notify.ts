import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from './email'
import { sendWhatsapp, checkBroadcast } from './whatsapp'
import { supabaseService } from './supabase/service'
import { sendPush } from './push'
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
  // AUTHENTICATION template: Meta writes the body, so it has no row in
  // notification_templates and is never rendered here. It appears only so
  // the outbox can record that a code went out.
  | 'signin_code'
  | 'invitation'
  | 'change_request_approved'
  | 'change_request_declined'
  | 'join_request_approved'
  | 'join_request_declined'
  | 'new_event'
  | 'rsvp_pending'
  | 'availability_pending'
  | 'payment_received'
  | 'payment_confirmed'
  // queued by a trigger when an account appears, and by the waiting room's
  // own nudge. No topic: an admin cannot mute the queue they are the queue for.
  | 'admin_pending_user'

// The Account page's notification matrix rows. Every topic maps 1:n to the
// template keys above; a template without a topic follows the old global
// notif_email/notif_whatsapp columns.
export type NotifTopic = 'new_event' | 'reminders' | 'rsvp_waitlist' | 'payments' | 'approvals'

export const TOPIC_OF: Partial<Record<TemplateKey, NotifTopic>> = {
  new_event: 'new_event',
  event_today: 'reminders',
  waitlist_promoted: 'rsvp_waitlist',
  rsvp_pending: 'rsvp_waitlist',
  availability_pending: 'rsvp_waitlist',
  payment_received: 'payments',
  payment_confirmed: 'payments',
  change_request_approved: 'approvals',
  change_request_declined: 'approvals',
  join_request_approved: 'approvals',
  join_request_declined: 'approvals',
}

type PrefsMatrix = Partial<Record<NotifTopic, { email?: boolean; whatsapp?: boolean; push?: boolean }>>

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
    .select('email, phone_whatsapp, notif_email, notif_whatsapp, notif_prefs, lang')
    .eq('id', userId)
    .maybeSingle()

  const topic = TOPIC_OF[template]
  const pref = topic ? ((user?.notif_prefs ?? {}) as PrefsMatrix)[topic] : undefined
  const emailOn = pref?.email ?? user?.notif_email ?? true
  const whatsappOn = pref?.whatsapp ?? user?.notif_whatsapp ?? false
  // Push has its own column in the matrix now, so it has its own answer here.
  // Defaulting it on matches what the app did before the column existed: a
  // subscription was the whole consent, and nobody who has one should stop
  // hearing from us because a new checkbox appeared unticked.
  const pushOn = pref?.push ?? true
  if (!emailOn && !whatsappOn && !pushOn) return

  const channels: ('email' | 'whatsapp' | 'push')[] = []
  if (emailOn && user?.email) channels.push('email')
  if (whatsappOn && user?.phone_whatsapp) channels.push('whatsapp')
  // The fallback is for people with no addressed channel left on, and it must
  // not fire just because push is carrying this one: pushing to a phone is not
  // a reason to also mail somebody who asked not to be mailed.
  if (!channels.length && !pushOn) {
    if (user?.email) channels.push('email')
    else if (user?.phone_whatsapp) channels.push('whatsapp')
  }

  // Push rides along rather than competing. The matrix on the account screen
  // has a column per address, and push is not an address: it is whichever
  // browsers this person told to ring, so it has no column and no fallback.
  // The topic guard above still applies, so muting a topic silences push too,
  // which is the only reading of "mute" that is not a surprise.
  //
  // Only queued when a subscription exists and a push version of the template
  // does, since the outbox has a foreign key on (channel, template, lang).
  const [{ count: subCount }, { data: pushTpl }] = await Promise.all([
    db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('notification_templates').select('key').eq('channel', 'push').eq('key', template).eq('lang', 'es').maybeSingle(),
  ])
  if (pushOn && subCount && pushTpl) channels.push('push')

  if (!channels.length) return

  // The language the person reads, resolved the same way the interface is: an
  // explicit choice in Tú, otherwise Spanish. There is no Accept-Language to
  // consult here, because nobody is holding a browser when this runs.
  //
  // Then, per channel, the language that channel can actually deliver. A
  // template only exists in English where somebody has written it, and
  // WhatsApp has none, so this asks rather than assumes: an English reader
  // gets English mail and Spanish WhatsApp until the Meta review is done, and
  // the row records which one it was.
  const want = user?.lang === 'en' ? 'en' : 'es'
  const langFor = new Map<string, string>()
  if (want !== 'es') {
    const { data: available } = await db
      .from('notification_templates')
      .select('channel')
      .eq('key', template)
      .eq('lang', want)
      .in('channel', channels)
    for (const row of available ?? []) langFor.set(row.channel as string, want)
  }

  await db.from('notification_outbox').insert(
    channels.map((channel) => ({
      user_id: userId,
      channel,
      template,
      payload: vars,
      lang: langFor.get(channel) ?? 'es',
    }))
  )
}

// Records a send that never passed through the queue. Direct sends go to
// people with no account, so the row identifies them by address instead of by
// user_id. The payload stays empty on purpose: the only interesting variable
// on an invitation is the link, and that link is a bearer credential for
// claiming the invitation, exactly like the magic link.
type SendResult = { ok: true; providerRef?: string } | { ok: false; skipped: boolean; error: string }

async function recordDirectSend(
  supabase: SupabaseClient,
  { channel, template, destination, result }: { channel: 'email' | 'whatsapp'; template: TemplateKey; destination: string; result: SendResult }
) {
  const handedOff = result.ok && !!result.providerRef
  await pipelineDb(supabase)
    .from('notification_outbox')
    .insert({
      user_id: null,
      destination,
      channel,
      template,
      payload: {},
      status: result.ok ? (handedOff ? 'pending' : 'sent') : result.skipped ? 'logged' : 'failed',
      provider_ref: handedOff ? result.providerRef : null,
      sent_at: result.ok && !handedOff ? new Date().toISOString() : null,
      error: result.ok ? null : result.error,
    })
}

// Direct send against a CMS template, for recipients who don't have a
// `users` row yet (invitations). Same template source as the queued path, so
// editing the "invitation" template in the admin CMS covers both.
export async function sendTemplatedEmail(
  supabase: SupabaseClient,
  { to, template, vars, lang = 'es' }: { to: string; template: TemplateKey; vars: Record<string, string>; lang?: 'es' | 'en' }
) {
  // Direct sends go to people who may have no account, so there is nobody to
  // ask. Spanish is the app's own language and the safe answer; the addressed
  // sends above resolve properly from the recipient.
  const { data: tpl } = await pipelineDb(supabase)
    .from('notification_templates')
    .select('*')
    .eq('channel', 'email')
    .eq('key', template)
    .eq('lang', lang)
    .maybeSingle()
  // Keys, not sentences. These land in notification_outbox.error and are read
  // back by the admin outbox log, so a Spanish sentence written here is frozen
  // in whichever language the server happened to be speaking. The log
  // translates them, and still prints anything it does not recognise, so rows
  // written before this still read.
  if (!tpl) return { ok: false as const, skipped: true as const, error: 'no_template' }
  const subject = renderTemplate(tpl.subject ?? 'Hive', vars)
  const html = renderTemplate(tpl.body, vars).replace(/\n/g, '<br>')
  const result = await sendEmail({ to, subject, html })
  await recordDirectSend(supabase, { channel: 'email', template, destination: to, result })
  return result
}

// The WhatsApp twin of sendTemplatedEmail, for the same reason: an invitee
// has no `users` row yet, so this cannot be queued and preference-checked
// like a notification to a member. It still lands in the outbox afterwards,
// identified by destination rather than by user.
//
// Meta only delivers templates it has reviewed, and the dispatcher checks
// that before sending. This path has no dispatcher, so it checks here, and
// records the skip so an unapproved template is visible rather than silent.
export async function sendTemplatedWhatsapp(
  supabase: SupabaseClient,
  { to, template, vars }: { to: string; template: TemplateKey; vars: Record<string, string> }
) {
  const { data: tpl } = await pipelineDb(supabase)
    .from('notification_templates')
    .select('*')
    .eq('channel', 'whatsapp')
    .eq('key', template)
    // WhatsApp has no English templates: each one needs Meta's approval, so
    // adding a language there is a submission and a wait, not an insert.
    .eq('lang', 'es')
    .maybeSingle()
  if (!tpl) return { ok: false as const, skipped: true as const, error: 'no_template' }
  if (tpl.wa_status !== 'approved') {
    const skipped = { ok: false as const, skipped: true as const, error: 'wa_template_unapproved' }
    await recordDirectSend(supabase, { channel: 'whatsapp', template, destination: to, result: skipped })
    return skipped
  }
  const result = await sendWhatsapp({
    to,
    templateName: template,
    language: tpl.wa_language ?? 'es_MX',
    vars: (tpl.wa_vars ?? []) as string[],
    variables: vars,
    body: renderTemplate(tpl.body, vars),
  })
  await recordDirectSend(supabase, { channel: 'whatsapp', template, destination: to, result })
  return result
}

// Push is the one channel that fans out: a member can have a subscription per
// browser, and each one can have died since it was stored. One outbox row
// covers the whole batch, and is settled by the best outcome in it, because
// "sent" on a row that reached the phone in their pocket and failed on a
// laptop they wiped months ago is the honest reading.
//
// A dead endpoint is deleted rather than reported. The browser threw the
// subscription away (cleared data, reinstalled, revoked permission) and
// keeping the row would mean failing against it forever.
async function deliverPush(
  db: SupabaseClient,
  row: { id: string; user_id: string; template: string; payload: unknown },
  tpl: { subject: string | null; body: string } | null,
  user: { display_name?: string | null } | null
) {
  if (!tpl || !user) {
    await db.from('notification_outbox').update({ status: 'logged', error: 'no_template' }).eq('id', row.id)
    return
  }

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', row.user_id)

  if (!subs?.length) {
    await db.from('notification_outbox').update({ status: 'logged', error: 'sin dispositivos' }).eq('id', row.id)
    return
  }

  const vars: Record<string, string> = {
    name: user.display_name ?? '',
    ...((row.payload ?? {}) as Record<string, string>),
  }
  const payload = {
    title: renderTemplate(tpl.subject ?? 'Hive', vars),
    body: renderTemplate(tpl.body, vars),
    // where tapping it lands. The template's own link when it has one, so a
    // notification about an event opens that event rather than the home screen.
    url: vars.link || '/',
    // one line per thing, rather than forty about the same event
    tag: `${row.template}:${vars.event_id ?? row.id}`,
  }

  let anySent = false
  let lastError = 'no se pudo enviar'
  let skipped = false
  for (const sub of subs) {
    const result = await sendPush(sub, payload)
    if (result.ok) {
      anySent = true
      continue
    }
    if (result.gone) {
      await db.from('push_subscriptions').delete().eq('id', sub.id)
      continue
    }
    lastError = result.error
    skipped = result.skipped
  }

  await db
    .from('notification_outbox')
    .update(
      anySent
        ? { status: 'sent', sent_at: new Date().toISOString(), error: null }
        : { status: skipped ? 'logged' : 'failed', error: lastError }
    )
    .eq('id', row.id)
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
    const channel = row.channel as 'email' | 'whatsapp' | 'push'
    const [{ data: tpl }, { data: user }] = await Promise.all([
      // The row carries the language, so the drain does not re-decide it. A
      // person who switched language between queueing and sending gets the
      // message that was actually addressed to them.
      db
        .from('notification_templates')
        .select('*')
        .eq('channel', channel)
        .eq('key', row.template)
        .eq('lang', (row as { lang?: string }).lang ?? 'es')
        .maybeSingle(),
      db.from('users').select('email, phone_whatsapp, display_name, notif_prefs').eq('id', row.user_id).maybeSingle(),
    ])

    // Push has no single destination: it fans out to every browser this person
    // subscribed, and the row is settled by how that batch went.
    if (channel === 'push') {
      await deliverPush(db, row, tpl, user)
      continue
    }

    const destination = channel === 'email' ? user?.email : user?.phone_whatsapp
    if (!tpl || !user || !destination) {
      const missing = channel === 'email' ? 'no_email' : 'no_whatsapp'
      await db
        .from('notification_outbox')
        .update({ status: 'logged', error: !tpl ? 'no_template' : missing })
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
        .update({ status: 'logged', error: 'muted_by_prefs' })
        .eq('id', row.id)
      continue
    }

    // Meta only delivers templates it has reviewed, so an unsubmitted or
    // still-pending one would fail on every send. Say so once, in the words
    // the admin panel uses, instead of collecting provider errors.
    if (channel === 'whatsapp' && tpl.wa_status !== 'approved') {
      await db
        .from('notification_outbox')
        .update({ status: 'logged', error: 'wa_template_unapproved' })
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
      console.error('[notify] dispatch after response failed', e)
    }
  })
}
