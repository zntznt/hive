# 06 · Roadmap & Requirements Cross-Check

## Phases

### v0 · "Our club runs one real event on it" (build now)
F1 clubs/roster/categories · F2 invitations + verification gate + admin panel (F11) · F3 lifecycle + share link · F4 availability grid · F5 RSVP with optional confirm/capacity/waitlist · F6 contributions · F7 expenses + balances · F8 polls (without apply-to-event) · F10 notifications (email live day one; WhatsApp as soon as Meta approval lands, Twilio sandbox during dev).

Suggested build order (each step demoable):
1. Auth + users + verification gate + admin panel (the spine everything hangs on)
2. Clubs, roster, categories, club home (static history first)
3. Events + share link + RSVP
4. Availability grid + finalize slot (+ Realtime)
5. Contributions → polls → expenses/balances
6. Notification outbox + email adapter → WhatsApp adapter

### v0.5 · fast follows (after the pilot event)
Guests + promotion flow (F9) · apply-poll-winner-to-event · settlement confirmations + min-cashflow suggestions polish · confirm-deadline semantics decision · duplicate-event ("same as last time") button, the recurring-club workhorse.

### v1 · club muscle
Cross-event **running club ledger** (toggle; schema already supports) · series templates · **category subscriptions** (default invites/notifications per category) · i18n ES/EN · PWA install.

### Later / public phase
Self-serve signup (relaxing the verification gate to per-club approval) · abuse hardening, rate limits · data export/delete self-service · discovery surface. Decision point: only after ≥2 external clubs ask for it.

**Gate between phases:** v0 → v0.5 requires the pilot event to hit the success criteria in [02](02-product-brief.md) (zero-instruction onboarding, zero chase messages, settled without spreadsheet).

## Requirements cross-check

*Every ask from the original request and all four feedback rounds, mapped. No orphans.*

| # | Requirement (user's words, condensed) | Spec | Schema | Phase |
|---|---|---|---|---|
| 1 | Timeslot planning "like crab.fit" | F4 | `events.sched_*`, `availability` | v0 |
| 2 | Confirmations / sign-ups | F5 | `rsvps.status/confirmed_at` | v0 |
| 3 | Optional hard re-confirm deadline | F5 | `events.confirm_deadline` | v0 |
| 4 | Optional capacity / optional waitlist | F5 | `events.capacity/waitlist_enabled`, `rsvps.waitlist_pos` | v0 |
| 5 | Assign who-brings-what; "you bring chairs" (organizer) vs "I'll bring chairs" (anyone); visible to all | F6 + matrix | `contributions` + RPC rule | v0 |
| 6 | Task lists / todos | F6 (`kind=task`) | `contributions.kind/due` | v0 |
| 7 | Cost splitting, bought before **or during** event | F7 | `expenses.spent_at`, `expense_shares` | v0 |
| 8 | Clarity on who bought what / who owes whom | F7 | `event_balances` view, `settlements` | v0 |
| 9 | Guests allowed only if event allows; no account; promotable; unpaid shares fall on inviter | F9 | `events.allow_guests`, `guests.promoted_to_user_id`, share roll-up | v0.5 |
| 10 | Polls to make decisions; members can create them too | F8 + matrix | `polls.created_by` | v0 |
| 11 | Applied poll winner: democratic result stays visible | F8 | `polls.applied_option_id/show_results` | v0.5 (apply) |
| 12 | Easy onboarding (the no-registration pain) → invite-first magic links | F2 | `invitations`, auth triggers | v0 |
| 13 | Web-based profile recovery, nothing device-bound | F2 / [03](03-identity-and-invitations.md) | auth channels on `users` | v0 |
| 14 | Admin invites emails and/or WhatsApp numbers; users link both | F2 | `invitations.email/phone`, `users.email/phone_whatsapp` | v0 |
| 15 | Admin panel, app-wide user admin, verification toggle gates active accounts | F11 + F2 | `users.status/is_app_admin`, `is_active_user()` RLS | v0 |
| 16 | Clubs as organizing entity: event history, member list, last attended | F1 | `clubs`, `club_members`, `attendance_stats` view | v0 |
| 17 | Event categories so nights don't blur (board games, scrapbooking, wargaming, movies…) | F1 | `event_categories`, `events.category_id` | v0 |
| 18 | Recurring events without re-setup | v0.5 duplicate-event; v1 series | copy from `events` + `contributions` | v0.5 |
| 19 | Drop event link in the WhatsApp group | F3 | `events.slug` + join_policy | v0 |
| 20 | WhatsApp notifications primary; email so WhatsApp isn't single point of contact | F10 / [07](07-notifications.md) | `notification_outbox` | v0 |
| 21 | Cost model: per-event settle-up now, ledger-ready | F7; v1 ledger | `expenses.event_id→club` chain | v0 / v1 |
| 22 | My groups first, public later | [02](02-product-brief.md) non-goals | verification gate | phase gate |
