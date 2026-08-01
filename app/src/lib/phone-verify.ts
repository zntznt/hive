import { createHash, randomInt } from 'crypto'
import { after } from 'next/server'
import { supabaseService } from './supabase/service'
import { sendWhatsapp } from './whatsapp'

// Proving a WhatsApp number belongs to the person adding it.
//
// The number used to be saved on sight, which was defensible while it was
// only a delivery address. Sign-in by WhatsApp turned it into an identity, so
// it is now held aside until a code sent to it comes back. Same Meta template
// as signing in: the message is "here is your code", and Meta writes it.

const TEMPLATE = 'codigo_acceso'
const CODE_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5

function hash(userId: string, code: string) {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex')
}

export type StartResult = { ok: true } | { ok: false; error: string }

// Sends a code to the candidate number. Nothing is written to the account
// until confirmPhoneChange succeeds.
export async function startPhoneChange(userId: string, phone: string): Promise<StartResult> {
  const db = supabaseService()
  if (!db) return { ok: false, error: 'La verificación por WhatsApp no está configurada.' }

  // Checked before sending rather than after, so a number already spoken for
  // does not cost someone a message. The unique index is still the authority.
  const { data: taken } = await db
    .from('users')
    .select('id')
    .eq('phone_whatsapp', phone)
    .neq('id', userId)
    .maybeSingle()
  if (taken) return { ok: false, error: 'Ese número ya está registrado en otra cuenta.' }

  // This path had no throttle whatsoever, while the sign-in one at least had
  // sixty seconds. Any signed-in account could loop it against ANY number on
  // earth (the only guard above is that the number is not already registered
  // here), sending real WhatsApp messages at the operator's expense. Same
  // limiter as sign-in, keyed by the number being messaged rather than by who
  // is asking, because the person being bothered is the one to protect.
  const { data: gate } = await db.rpc('signin_throttle_take', { p_contact: phone })
  if ((gate as { allowed?: boolean } | null)?.allowed !== true) {
    return { ok: false, error: 'Ya mandamos un código a ese número hace poco. Espera un minuto.' }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const { error: saveErr } = await db.from('phone_verifications').upsert({
    user_id: userId,
    phone,
    code_hash: hash(userId, code),
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
    attempts: 0,
    created_at: new Date().toISOString(),
  })
  if (saveErr) return { ok: false, error: 'No pudimos generar el código. Intenta de nuevo.' }

  // Written before the send, so a delivery that dies still leaves a trace.
  const { data: logged } = await db
    .from('notification_outbox')
    .insert({
      user_id: userId,
      destination: phone,
      channel: 'whatsapp',
      // same Meta template as signing in; the payload says what it was for,
      // since the two are worth telling apart in the admin log
      template: 'signin_code',
      payload: { purpose: 'phone_verify', requested_at: new Date().toISOString() },
      status: 'queued',
    })
    .select('id')
    .single()

  // Three sequential calls to Zernio do not belong in front of someone
  // waiting on a settings screen.
  after(async () => {
    try {
      const sent = await sendWhatsapp({
        to: phone,
        templateName: TEMPLATE,
        language: 'es_MX',
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
      if (!sent.ok && !sent.skipped) {
        await db.from('phone_verifications').delete().eq('user_id', userId)
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'error desconocido al enviar'
      if (logged) {
        await db.from('notification_outbox').update({ status: 'failed', error: reason }).eq('id', logged.id)
      }
      await db.from('phone_verifications').delete().eq('user_id', userId)
    }
  })

  return { ok: true }
}

export type ConfirmResult = { ok: true; phone: string; enabledWhatsapp: boolean } | { ok: false; error: string }

export async function confirmPhoneChange(userId: string, code: string): Promise<ConfirmResult> {
  const db = supabaseService()
  if (!db) return { ok: false, error: 'La verificación por WhatsApp no está configurada.' }

  const wrong = { ok: false as const, error: 'Ese código no es correcto o ya venció. Pide uno nuevo.' }

  const { data: row } = await db
    .from('phone_verifications')
    .select('phone, code_hash, expires_at, attempts')
    .eq('user_id', userId)
    .maybeSingle()
  if (!row) return wrong

  if (new Date(row.expires_at) < new Date() || row.attempts >= MAX_ATTEMPTS) {
    await db.from('phone_verifications').delete().eq('user_id', userId)
    await db.rpc('signin_throttle_fail', { p_contact: row.phone })
    return wrong
  }

  if (row.code_hash !== hash(userId, code.trim())) {
    // atomic, for the same reason as sign-in: this was a read-modify-write and
    // parallel guesses all read the same number
    await db.rpc('phone_verify_attempt', { p_user: userId })
    await db.rpc('signin_throttle_fail', { p_contact: row.phone })
    return wrong
  }

  // Adding a number is a clear request to be messaged there, so the first one
  // turns the channel on. Changing an existing number leaves the preference
  // alone: someone may have switched WhatsApp off deliberately.
  const { data: before } = await db
    .from('users')
    .select('phone_whatsapp')
    .eq('id', userId)
    .maybeSingle()
  const firstNumber = !before?.phone_whatsapp

  const { error: updErr } = await db
    .from('users')
    .update({
      phone_whatsapp: row.phone,
      phone_verified_at: new Date().toISOString(),
      ...(firstNumber ? { notif_whatsapp: true } : {}),
    })
    .eq('id', userId)
  if (updErr) {
    if (updErr.code === '23505') return { ok: false, error: 'Ese número ya está registrado en otra cuenta.' }
    return { ok: false, error: 'No pudimos guardar el número. Intenta de nuevo.' }
  }

  await db.from('phone_verifications').delete().eq('user_id', userId)
  return { ok: true, phone: row.phone, enabledWhatsapp: firstNumber }
}
