import { createHash, randomInt } from 'crypto'
import { after } from 'next/server'
import { supabaseService } from './supabase/service'
import { supabaseServer } from './supabase/server'
import { sendWhatsapp } from './whatsapp'

// Sign in over WhatsApp, the only way Meta allows it.
//
// A tappable link is impossible here: Meta rejected the same body as UTILITY
// and as MARKETING with INCORRECT_CATEGORY, because it recognises a sign-in
// message and requires the AUTHENTICATION category, which accepts only a
// one-time code with a copy-code button. So the member gets a code, types it
// back, and the session is minted here. They never handle a token.
//
// The Supabase session still comes from generateLink: once our own code is
// verified, the server mints a magic link for that account and consumes it
// itself, which sets the session cookies without a round trip through mail.

const TEMPLATE = 'codigo_acceso'
const CODE_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5
const THROTTLE_SECONDS = 60

// The stored value is never the code. This table is readable by anything
// holding the service key, and a plaintext code there is a standing account
// takeover. Salted per user so identical codes hash differently.
function hash(userId: string, code: string) {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex')
}

function safeNext(raw?: string | null) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null
}

export type CodeRequest = { ok: true } | { ok: false; error: string }

// Always reports success for an unknown number. The sign-in form is
// unauthenticated, so a distinguishable answer turns it into a way to test
// which phone numbers hold an account.
export async function requestSigninCode(phone: string): Promise<CodeRequest> {
  const db = supabaseService()
  if (!db) return { ok: false, error: 'El inicio de sesión por WhatsApp no está configurado.' }

  const { data: user } = await db
    .from('users')
    .select('id, display_name')
    .eq('phone_whatsapp', phone)
    .maybeSingle()
  if (!user) return { ok: true }

  const { data: existing } = await db
    .from('signin_codes')
    .select('created_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (existing && Date.now() - new Date(existing.created_at).getTime() < THROTTLE_SECONDS * 1000) {
    return { ok: true }
  }

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
  if (saveErr) return { ok: false, error: 'No pudimos generar el código. Intenta de nuevo.' }

  // Record the attempt before trying to deliver it. Twice now a send has
  // vanished leaving nothing behind, because the row was only written after
  // the part that failed. A row that exists first can be stuck, and a stuck
  // row is a fact you can read; silence is not.
  const { data: logged } = await db
    .from('notification_outbox')
    .insert({
      user_id: user.id,
      destination: phone,
      channel: 'whatsapp',
      template: 'signin_code',
      // never the code, for the same reason it is hashed in signin_codes
      payload: { requested_at: new Date().toISOString() },
      status: 'queued',
    })
    .select('id')
    .single()

  // Delivery is three sequential calls to Zernio, seconds each, and putting
  // that in front of the member means they watch a spinner for the length of
  // someone else's outage. The code is already saved, so the form can move to
  // the entry step now and the message can catch up. Whether it arrived is
  // answered by the outbox, not by how long we made them wait.
  after(async () => {
    try {
    const sent = await sendWhatsapp({
      to: phone,
      templateName: TEMPLATE,
      language: 'es_MX',
      // Meta owns the body of an authentication template, so there is nothing
      // to render and no wa_vars to honor. The code is the only parameter.
      vars: [],
      variables: {},
      body: '',
      otpCode: code,
    })

      if (logged) {
        await db
          .from('notification_outbox')
          .update({
            status: sent.ok ? 'pending' : sent.skipped ? 'logged' : 'failed',
            provider_ref: sent.ok ? sent.providerRef : null,
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
export async function verifySigninCode(phone: string, code: string, next?: string | null): Promise<CodeVerify> {
  const db = supabaseService()
  if (!db) return { ok: false, error: 'El inicio de sesión por WhatsApp no está configurado.' }

  const { data: user } = await db
    .from('users')
    .select('id, email')
    .eq('phone_whatsapp', phone)
    .maybeSingle()
  // Same wording for "no account", "no code" and "wrong code": a distinct
  // message for each would let someone map which numbers are registered.
  const wrong = { ok: false as const, error: 'Ese código no es correcto o ya venció. Pide uno nuevo.' }
  if (!user?.email) return wrong

  const { data: row } = await db
    .from('signin_codes')
    .select('code_hash, expires_at, attempts')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!row) return wrong

  if (new Date(row.expires_at) < new Date() || row.attempts >= MAX_ATTEMPTS) {
    await db.from('signin_codes').delete().eq('user_id', user.id)
    return wrong
  }

  if (row.code_hash !== hash(user.id, code.trim())) {
    await db
      .from('signin_codes')
      .update({ attempts: row.attempts + 1 })
      .eq('user_id', user.id)
    return wrong
  }

  await db.from('signin_codes').delete().eq('user_id', user.id)

  // Mint a magic link for this account and consume it here. verifyOtp on the
  // cookie-bound server client is what actually writes the session, so the
  // member is signed in when this returns.
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkErr || !tokenHash) return { ok: false, error: 'No pudimos abrir tu sesión. Intenta con tu correo.' }

  const supabase = await supabaseServer()
  const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (otpErr) return { ok: false, error: 'No pudimos abrir tu sesión. Intenta con tu correo.' }

  return { ok: true, next: safeNext(next) ?? '/' }
}
