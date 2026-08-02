import webpush from 'web-push'

// Web push, the third channel.
//
// Email and WhatsApp go to an address that belongs to a person. Push goes to a
// browser: one person can hold several subscriptions, each is per browser per
// machine, and any of them can be revoked without telling us. So this module
// deals in endpoints rather than addresses, and treats a dead one as an
// ordinary outcome rather than an error.
//
// VAPID is how the push service knows the sender is us. The public half is
// shipped to the browser (it goes into the subscribe call), the private half
// signs and never leaves the server. Unset, everything here reports "skipped"
// the way email and WhatsApp do when their providers are unconfigured, so a
// half-configured install degrades quietly instead of filling the admin panel
// with red.

export type PushPayload = {
  title: string
  body: string
  url: string
  tag?: string
}

export type PushResult =
  | { ok: true }
  | { ok: false; skipped: boolean; error: string; gone?: boolean }

let configured: boolean | null = null

function ready() {
  if (configured !== null) return configured
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    configured = false
    return false
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hola@hive.zntznt.com', publicKey, privateKey)
  configured = true
  return true
}

export type StoredSubscription = {
  endpoint: string
  p256dh: string
  auth: string
}

export async function sendPush(sub: StoredSubscription, payload: PushPayload): Promise<PushResult> {
  if (!ready()) return { ok: false, skipped: true, error: 'push not configured' }
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 }
    )
    return { ok: true }
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    // 404 and 410 mean the browser threw the subscription away: the user
    // cleared site data, reinstalled, or revoked permission. That is not a
    // failure to report, it is a row to delete.
    if (status === 404 || status === 410) {
      return { ok: false, skipped: true, error: 'subscription expired', gone: true }
    }
    const message = e instanceof Error ? e.message : 'unknown push send error'
    return { ok: false, skipped: false, error: message }
  }
}
