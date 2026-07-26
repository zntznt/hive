# 07 — Notifications: WhatsApp-Primary, Email-Redundant

## Strategy

WhatsApp is where the user's groups already live — it is the **primary** channel. Email exists so WhatsApp is never a single point of contact (and because some invitees may only have an email). Web push is deliberately absent: WhatsApp *is* the push channel for these groups.

Routing rule per user: send on preferred channel (default WhatsApp if a number is linked, else email); on hard failure, fall back to the other linked channel; record everything in the outbox.

## Architecture: the outbox

```
domain event (slot picked, contribution assigned, …)
   └─▶ row in notification_outbox (user, channel, template, payload)   [same tx as the change]
         └─▶ delivery worker (Supabase Edge Function on schedule / queue)
               ├─ WhatsAppAdapter  → Zernio (BSP in front of Meta Cloud API)
               ├─ EmailAdapter     → Resend (app notifications); Supabase SMTP keeps auth emails
               └─ LogAdapter       → dev/no-creds fallback: marks status='logged'
```

- Decoupling means triggers never wait on Meta/Resend, retries are data, and the admin panel can show queued/sent/failed.
- Auth emails (magic links) go through Supabase Auth's own mailer — separate from this pipeline. WhatsApp-delivered sign-in links/OTP ride the WhatsApp adapter when it's live.

## Notification matrix (v0)

| Trigger | Recipients | Template id | Urgency class |
|---|---|---|---|
| Invitation created/resent | invitee (channel from invitation) | `invite` | utility |
| Event scheduled (slot picked) | event members | `event_scheduled` | utility |
| Confirm reminder (deadline −48h, −12h) | members `in`, unconfirmed | `confirm_reminder` | utility |
| Contribution assigned to you | assignee | `contribution_assigned` | utility |
| Waitlist → promoted to attending | promoted member | `waitlist_promoted` | utility |
| New poll | event members | `new_poll` | utility |
| Balances posted / settle-up request | debtors | `settle_up` | utility |
| New pending account | app admin | `admin_pending_user` | utility |

Everything is **utility class** (transactional, related to an interaction the user is part of) — the cheap, fast-approval template category. Nothing here is marketing.

## WhatsApp: facts & setup (as of mid-2026)

**Pricing model:** per delivered template message since July 2025 (conversation pricing is gone). Utility templates are the cheap class (US ≈ $0.004–0.006; EU higher but utility stays far below marketing's ~$0.13). **Free-form messages and utility templates inside an open 24h customer-service window are free** — and every member reply opens that window. At club volume (tens of messages/week) this is pennies per month; cost is not a factor, setup ceremony is.

**Setup checklist (prerequisite workstream — start early, runs parallel to dev):**
1. Meta Business Portfolio (business.facebook.com) + verify the business (ID checks; hobbyist verification is the usual friction point).
2. WhatsApp Business Platform app in Meta for Developers → Cloud API (the default, free-to-call API; no on-prem).
3. **Dedicated phone number** (cannot be a number actively used on consumer WhatsApp). Open question in [05](05-feature-spec.md): cheap eSIM vs. virtual number.
4. Display name approval; then submit **utility templates** (examples below) — approval typically hours-to-days.
5. Webhook endpoint (Edge Function) for delivery receipts + inbound replies (replies open the free 24h window; v0 just logs them, v0.5 may parse "CONFIRMO").

**Dev path before approval:** Twilio WhatsApp **sandbox** — works immediately; each tester joins by sending a code once (fine for the founder's club). The adapter interface hides whether sends go via Meta Cloud API or Twilio, so swapping is config, not code.

## Status (as built)

We went through **Zernio** rather than calling Meta Cloud API directly, so steps 2-5 of the checklist above are handled on their side against a connected WhatsApp Business number.

- Adapter lives in `app/src/lib/whatsapp.ts`, same shape as `email.ts`: no SDK, one config seam.
- Config is `ZERNIO_API_KEY`, `ZERNIO_PROFILE_ID`, `ZERNIO_ACCOUNT_ID`. With any of them unset the adapter is a safe no-op that marks rows `logged`, so a half-configured install degrades quietly instead of failing loudly.
- Zernio has no single transactional "send template to this number" call. Reaching a number that has never messaged us first goes through a broadcast: create with template, attach recipient, send. Three calls per notification, which is irrelevant at this volume.
- Delivery address is `users.phone_whatsapp`, linked by the member on the Account page and normalized to E.164. Sign-in stays email-only; the number is purely a delivery address.
- Per the matrix in `users.notif_prefs`, both channels can fire for one notification: each enabled channel queues its own outbox row. A channel with no address is skipped and falls back to the one that exists.

**Open:** the broadcast template payload has not been verified against a live account. Send failures record Zernio's verbatim response in `notification_outbox.error`, visible in the admin panel. The template names Hive uses (`waitlist_promoted`, `new_event`, `payment_received`, …) must exist as approved WhatsApp templates on the Zernio side before sends outside a 24h window will succeed.

## Template examples (submit ES + EN variants)

`event_scheduled` (utility):
> 📅 *{{club}}*: «{{event}}» ya tiene fecha — **{{datetime}}** en {{location}}. Confirma y mira quién va: {{link}}

`confirm_reminder` (utility):
> ⏰ «{{event}}» es el {{datetime}}. ¿Sigues viniendo? Confirma antes del {{deadline}}: {{link}}

`contribution_assigned` (utility):
> 🎒 {{organizer}} te ha asignado «{{item}}» para «{{event}}». Detalles: {{link}}

`settle_up` (utility):
> 💶 Cuentas de «{{event}}»: te toca {{amount}} a {{payee}}. Resumen: {{link}}

(Localized EN twins; placeholders are Meta template variables. Links are deep links into the event — and double as the re-engagement path.)

## Email (redundancy channel)

- **Resend** for app notifications: simple API, generous free tier, React-Email templates (same stack family as Rallly uses); domain DKIM/SPF setup is a 30-minute task.
- Supabase Auth keeps sending magic links itself (its SMTP can also be pointed at Resend for consistent from-address).
- Same template ids render as email subjects/bodies; the outbox doesn't care.

## Per-user preferences (v0-simple)

`users.settings.notify`: `whatsapp_first` (default when number linked) | `email_first` | `both` | `mute_non_critical`. Confirm reminders and waitlist promotions always send — they're the ones with real-world cost when missed.
