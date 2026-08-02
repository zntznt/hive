import { createHash, randomInt } from 'crypto'
import { after } from 'next/server'
import { supabaseService } from './supabase/service'
import { supabaseServer } from './supabase/server'
import { sendWhatsapp } from './whatsapp'
import { sendEmail } from './email'
import { getT } from './current-lang'

// Sign in with a code, on either channel.
//
// WhatsApp forced the design: Meta rejected the same body as UTILITY and as
// MARKETING with INCORRECT_CATEGORY, because it recognises a sign-in message
// and requires the AUTHENTICATION category, which accepts only a one-time code
// with a copy-code button. So the member gets a code, types it back, and the
// session is minted here. They never handle a token.
//
// Email then kept its magic link for a while, which meant the same app asked
// for six digits on one channel and a tapped link on the other. The link is
// the worse half: it opens in whichever browser the mail app prefers, which is
// not the one holding the half-finished sign-in, and on a phone that is most
// of the reason this fails. Both channels are codes now, and the only thing
// that differs is what carries it.
//
// The Supabase session still comes from generateLink: once our own code is
// verified, the server mints a magic link for that account and consumes it
// itself, which sets the session cookies without a round trip through mail.

const TEMPLATE = 'codigo_acceso'
// One address shape decides everything downstream: which column identifies the
// account, which channel carries the code, and what the outbox row says.
const isEmail = (v: string) => v.includes('@')

// Deliberately plain. A sign-in code is read in two seconds from a
// notification shade, so the only job here is to make the digits the largest
// thing in the message and let the rest get out of the way.
//
// This is the one message the app renders itself rather than reading out of
// notification_templates, because it is sent before there is anything to
// queue. It followed neither table until now: an English member got an
// English screen, typed their address, and was sent a Spanish email about it.
// Migration 0053 added an English `signin_code` template that this path never
// reads, so the row is the record and these three keys are the copy.
function signinEmailHtml(code: string, lead: string, foot: string) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#231a12">
  <p style="font-size:15px;line-height:1.5;margin:0 0 18px">${lead}</p>
  <p style="font-size:34px;font-weight:800;letter-spacing:.22em;margin:0 0 18px;color:#231a12">${code}</p>
  <p style="font-size:13.5px;line-height:1.6;color:#6b5b4b;margin:0">
    ${foot}
  </p>
</div>`
}
const CODE_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5

// The stored value is never the code. This table is readable by anything
// holding the service key, and a plaintext code there is a standing account
// takeover. Salted per user so identical codes hash differently.
function hash(userId: string, code: string) {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex')
}

// Browsers normalize "/\evil.com" to "//evil.com", so a leading-"//" test
// alone would let an absolute URL through here.
function safeNext(raw?: string | null) {
  return raw && /^\/[^/\\]/.test(raw) ? raw : null
}

export type CodeRequest = { ok: true } | { ok: false; error: string }

// Always reports success for an unknown number. The sign-in form is
// unauthenticated, so a distinguishable answer turns it into a way to test
// which phone numbers hold an account.
export async function requestSigninCode(contact: string): Promise<CodeRequest> {
  // Resolved here rather than taken as a parameter: this runs inside a server
  // action, getT() is cached for the request, and every caller would otherwise
  // have to thread a language it does not care about. The message answers
  // something somebody just did in a browser, so it follows THAT browser
  // rather than the account's stored preference: a Spanish screen and an
  // English code email is the same half-noticing this set out to fix.
  const { t, tf } = await getT()
  const db = supabaseService()
  if (!db) return { ok: false, error: t('auth.notConfigured') }
  const email = isEmail(contact)

  // The throttle is taken BEFORE the account lookup, and keyed by number
  // rather than by user, for two reasons. It has to survive the signin_codes
  // row (it used to be inferred from that row's existence, and verify deleted
  // the row on the attempt cap, so burning six guesses reset the limiter and
  // a six digit code fell in a couple of hours). And an unknown number has to
  // cost the same as a real one, or the difference is an oracle for which
  // numbers hold an account.
  const { data: gate } = await db.rpc('signin_throttle_take', { p_contact: contact })
  const allowed = (gate as { allowed?: boolean } | null)?.allowed === true
  if (!allowed) return { ok: true }

  // A disabled account is one an admin shut off or one whose owner asked us to
  // delete it, and neither should be handed a way back in. Deletion clears the
  // number as well, so this is the belt to that braces.
  const { data: user } = await db
    .from('users')
    .select('id, display_name')
    .eq(email ? 'email' : 'phone_whatsapp', contact)
    .neq('status', 'disabled')
    .maybeSingle()
  if (!user) return { ok: true }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')

  // Upsert, so asking for a new code silently invalidates the previous one
  // and resets the attempt counter.
  const { error: saveErr } = await db.from('signin_codes').upsert({
    user_id: user.id,
    code_hash: hash(user.id, code),
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
    attempts: 0,
    created_at: new Date().toISOString(),
  })
  if (saveErr) return { ok: false, error: t('auth.codeFailed') }

  // Record the attempt before trying to deliver it. Twice now a send has
  // vanished leaving nothing behind, because the row was only written after
  // the part that failed. A row that exists first can be stuck, and a stuck
  // row is a fact you can read; silence is not.
  const { data: logged, error: logErr } = await db
    .from('notification_outbox')
    .insert({
      user_id: user.id,
      destination: contact,
      channel: email ? 'email' : 'whatsapp',
      template: 'signin_code',
      // never the code, for the same reason it is hashed in signin_codes
      payload: { requested_at: new Date().toISOString() },
      status: 'queued',
    })
    .select('id')
    .single()
  // This insert failing is how four sign-ins vanished without a trace: the
  // outbox has a foreign key on (channel, template) and signin_code had no
  // row to point at. An unchecked error on the thing whose job is to record
  // errors is worth failing loudly for.
  if (logErr) {
    await db.from('signin_codes').delete().eq('user_id', user.id)
    return { ok: false, error: t('auth.logFailed') }
  }

  // Delivery is three sequential calls to Zernio, seconds each, and putting
  // that in front of the member means they watch a spinner for the length of
  // someone else's outage. The code is already saved, so the form can move to
  // the entry step now and the message can catch up. Whether it arrived is
  // answered by the outbox, not by how long we made them wait.
  // Resolved before `after`, because the request's headers are gone by the
  // time this runs and getT() would fall back to Spanish for everybody.
  const mail = {
    subject: tf('mail.signin.subject', { code }),
    lead: t('mail.signin.lead'),
    foot: t('mail.signin.foot'),
  }

  after(async () => {
    try {
    const sent = email
      ? await sendEmail({
          to: contact,
          // The code is in the subject as well as the body, so it is readable
          // from the notification without opening anything, which is the one
          // thing the magic link could never do.
          subject: mail.subject,
          html: signinEmailHtml(code, mail.lead, mail.foot),
        })
      : await sendWhatsapp({
          to: contact,
          templateName: TEMPLATE,
          language: 'es_MX',
          // Meta owns the body of an authentication template, so there is
          // nothing to render and no wa_vars to honor. The code is the only
          // parameter.
          vars: [],
          variables: {},
          body: '',
          otpCode: code,
        })

      if (logged) {
        await db
          .from('notification_outbox')
          .update({
            // Resend's ok has no provider ref to record, where Meta's does.
            // Reading one off the other is how this stopped compiling, and
            // pretending otherwise would write "undefined" into the column an
            // admin uses to chase a message.
            status: sent.ok ? 'pending' : sent.skipped ? 'logged' : 'failed',
            provider_ref: sent.ok && 'providerRef' in sent ? sent.providerRef : null,
            error: sent.ok ? null : sent.error,
          })
          .eq('id', logged.id)
      }

      // The code row doubles as the throttle, so a send that never happened
      // must not lock the member out of asking again.
      if (!sent.ok && !sent.skipped) {
        await db.from('signin_codes').delete().eq('user_id', user.id)
      }
    } catch (e) {
      // Nothing is listening by now, so an uncaught throw here is how the
      // last two attempts disappeared. Leave the reason on the row instead.
      const reason = e instanceof Error ? e.message : 'error desconocido al enviar'
      if (logged) {
        await db.from('notification_outbox').update({ status: 'failed', error: reason }).eq('id', logged.id)
      }
      await db.from('signin_codes').delete().eq('user_id', user.id)
    }
  })

  return { ok: true }
}

export type CodeVerify = { ok: true; next: string } | { ok: false; error: string }

// Verifies our own code, then establishes the Supabase session. Wrong codes
// burn an attempt so a six digit code cannot be guessed at leisure, and the
// row is deleted the moment it succeeds so a code is usable exactly once.
export async function verifySigninCode(contact: string, code: string, next?: string | null): Promise<CodeVerify> {
  const { t } = await getT()
  const db = supabaseService()
  if (!db) return { ok: false, error: t('auth.notConfigured') }

  const { data: user } = await db
    .from('users')
    .select('id, email')
    .eq(isEmail(contact) ? 'email' : 'phone_whatsapp', contact)
    .neq('status', 'disabled')
    .maybeSingle()
  // Same wording for "no account", "no code" and "wrong code": a distinct
  // message for each would let someone map which numbers are registered.
  const wrong = { ok: false as const, error: t('auth.badCode') }
  if (!user?.email) return wrong

  const { data: row } = await db
    .from('signin_codes')
    .select('code_hash, expires_at, attempts')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) return wrong

  if (new Date(row.expires_at) < new Date() || row.attempts >= MAX_ATTEMPTS) {
    await db.from('signin_codes').delete().eq('user_id', user.id)
    // deleting the code must not also clear the limiter, which is the whole
    // reason this counter lives in its own table
    await db.rpc('signin_throttle_fail', { p_contact: contact })
    return wrong
  }

  if (row.code_hash !== hash(user.id, code.trim())) {
    // one guess costs exactly one attempt: this was a read-modify-write over
    // the network, so parallel guesses all read the same number and all wrote
    // the same increment
    await db.rpc('signin_code_attempt', { p_user: user.id })
    await db.rpc('signin_throttle_fail', { p_contact: contact })
    return wrong
  }

  await db.from('signin_codes').delete().eq('user_id', user.id)
  await db.rpc('signin_throttle_ok', { p_contact: contact })

  // Mint a magic link for this account and consume it here. verifyOtp on the
  // cookie-bound server client is what actually writes the session, so the
  // member is signed in when this returns.
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkErr || !tokenHash) return { ok: false, error: t('auth.sessionFailed') }

  const supabase = await supabaseServer()
  const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (otpErr) return { ok: false, error: t('auth.sessionFailed') }

  return { ok: true, next: safeNext(next) ?? '/' }
}
