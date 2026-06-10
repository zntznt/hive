# 05 — Feature Spec (v0 PRD)

*Companion docs: [problem & users](02-product-brief.md) · [identity flows](03-identity-and-invitations.md) · [schema](04-data-model.md) · [phasing](06-roadmap.md) · [channels](07-notifications.md)*

## Problem statement

Recurring social events are coordinated across five disconnected tools plus a noisy WhatsApp thread; the overhead lands on one organizer every time, and nothing (attendance, who-brings-what habits, debts) is remembered between events. Existing products each own one slice — none integrates the loop, and none notifies via WhatsApp where these groups actually live.

## Goals

1. A club member completes availability + RSVP from the WhatsApp share link in **< 2 minutes**, with zero instructions.
2. One real club event runs **end-to-end** on the app (scheduled → confirmed → contributed → settled) with **no parallel spreadsheet and zero individual chase messages**.
3. Club home answers "who comes to what, and when did they last come?" from derived data alone.
4. Every account that exists was **explicitly approved** by the app admin.

## Non-goals (v0)

- **Public self-serve signup** — instance is admin-gated; revisit at public phase.
- **Payment processing** — we compute who-owes-whom; money moves outside (Bizum/cash).
- **Cross-event running ledger** — schema-ready, product-off ([06](06-roadmap.md)).
- **Native apps / push** — responsive web; WhatsApp *is* the push channel.
- **Calendar sync & RRULE recurrence** — "duplicate event" covers recurring clubs for now.

## Personas

- **Marta — event organizer** (rotates per event): creates the event, picks the slot, assigns, nudges.
- **Jorge — club member**: taps links from WhatsApp, RSVPs, volunteers to bring things, fronts money sometimes.
- **Ana — guest**: Jorge's +1; no account; may become a member later.
- **The app admin** (the founder): verifies accounts, keeps the instance tidy.

---

## Feature areas

### F1. Clubs, roster & categories — **Must**

Stories:
- As a club admin, I want a club home with roster and event history so the club has a memory.
- As a club admin, I want to define event categories (board games, scrapbooking, wargaming, movies…) so different nights don't blur into one blob.
- As a member, I want to see per-member attendance (overall and per category) so "when did X last come?" has an answer.

Acceptance:
- [ ] Club home shows: upcoming events, past events filterable/groupable by category, roster with role badges.
- [ ] Categories are club-defined (name + emoji/color); only club admins manage them; events reference at most one.
- [ ] Attendance = RSVP `in` on `done` events, computed by view; shows count + last-attended per member, filterable by category.
- [ ] Members with zero attendance still appear in roster (joined_at shown).

### F2. Accounts, invitations & verification gate — **Must**

Stories:
- As an organizer, I want to invite people by email and/or WhatsApp number so nobody fills a signup form.
- As an invitee, I want to tap my personal link and land signed-in on my profile so onboarding is invisible.
- As the app admin, I want every new account to require my verification so I control exactly who is in.
- As a user, I want to link both channels and sign in from any device via magic link/OTP so identity never depends on a device.

Acceptance:
- [ ] Given an invitation from a non-admin, when claimed, then the account exists as `pending` and sees only the waiting screen.
- [ ] Given an invitation created by the app admin, when claimed, then the account is `active` immediately.
- [ ] Pending users can see/do nothing club-related (enforced by RLS, verified by test).
- [ ] App admin gets a WhatsApp/email notification on each new pending account.
- [ ] Profile shows both channels; adding one requires OTP verification to that channel; either signs you in afterward.
- [ ] Re-sending an invite never duplicates accounts or memberships.

### F3. Event lifecycle & share link — **Must**

Stories:
- As an organizer, I want to create an event under a category and share one link in the WhatsApp group so the whole flow starts from chat.
- As a member, I want the same link to always show the event's current state (scheduling vs scheduled vs done) so there's one source of truth.

Acceptance:
- [ ] States: `draft → scheduling → scheduled → done | cancelled`; visible state drives the page layout.
- [ ] Share link `/e/{slug}`: signed-in club members enter directly (auto-join per `club_members_only`); signed-out users go through magic link first; unknown visitors handled per join policy; title-only preview pre-auth.
- [ ] Organizer can edit details, change category, cancel with optional note (notifies).

### F4. Timeslot finding (crab.fit-style) — **Must**

Stories:
- As an organizer, I want to propose a date range + daily time window so members paint availability instead of debating in chat.
- As a member, I want to paint my availability on a grid (tap/drag, mobile-friendly) and see the live heatmap so the best slot is obvious.
- As an organizer, I want suggested best slots and one-tap finalize so deciding is a moment, not a meeting.

Acceptance:
- [ ] Grid = event-defined window at 15/30/60-min granularity; stored as UTC slot indexes; rendered in viewer's local timezone (label shows tz).
- [ ] Painting writes only your own availability; heatmap aggregates all; updates live (Realtime) without refresh.
- [ ] "Best slots" ranks contiguous runs by attendee count (ties → earlier); organizer can override freely.
- [ ] Finalizing sets `chosen_start/end`, moves state to `scheduled`, triggers notifications; availability stays viewable (read-only).

### F5. RSVP, confirmations, capacity & waitlist — **Must** (optional toggles per event)

Stories:
- As a member, I want one-tap in/out/maybe so signing up is trivial.
- As an organizer, I want an optional confirm-by deadline so "yes three weeks ago" becomes a real headcount.
- As an organizer, I want optional capacity with a waitlist so oversubscribed nights manage themselves.

Acceptance:
- [ ] RSVP states in/out/maybe, changeable until event start; roster shows counts + guest counts.
- [ ] If `confirm_deadline` set: members with `in` get a confirm prompt + reminder; unconfirmed by deadline are flagged to organizer (not auto-dropped — social call).
- [ ] If `capacity` set: `in` beyond capacity → waitlist position (atomic RPC, no double-grant); a freed spot promotes the head of the waitlist + notifies.
- [ ] All three settings default **off**; events without them never show the related UI.

### F6. Contributions (bring-list & tasks) — **Must**

Stories:
- As a member, I want to declare "I'll bring chairs" so my offer is visible to all.
- As an organizer, I want to assign "you bring the ball" to someone, or post open needs anyone can claim, so nothing is forgotten.
- As a member, I want to mark mine done/bought so the list reflects reality.

Acceptance:
- [ ] Given a member, when creating a contribution, then `assigned_to` is forced to self; claiming an open item sets it to self; cannot edit others' rows (RPC + RLS enforced).
- [ ] Given an organizer, when creating/assigning, then any member (or nobody = open need) is allowed; assignment notifies the assignee.
- [ ] Kinds `bring` (with free-text qty) and `task` (with optional due); single list, filterable; done-state visible to all; everything logged to activity.

### F7. Expenses & per-event balances — **Must**

Stories:
- As a member, I want to log "I paid 42 € for pizzas, split among attendees" before, during, or after the event so fronting money isn't a memory exercise.
- As a member, I want to see who owes whom and suggested minimal transfers so settling is two Bizums, not a negotiation.

Acceptance:
- [ ] Expense = payer, amount, currency (club default), note, participants (default: everyone `in`, editable; guests includable); equal split by default, custom weights allowed.
- [ ] Balances view: paid / owed / net per person; guest shares roll up to their host; sums to zero.
- [ ] Settle-up suggestions (min-cashflow) shown; recording a settlement adjusts balances; recipient confirms receipt.
- [ ] Any member logs expenses; only payer/creator or organizer edits/deletes; every money mutation activity-logged.

### F8. Polls — **Must** (apply-to-event: **Should**)

Stories:
- As any member, I want to create a poll (which game? which bar?) so decisions don't require the organizer.
- As a voter, I want optional anonymity and a close date so honest votes happen on time.
- As an organizer, I want to apply a winning option to the event while the vote results stay visible so decisions are transparent.

Acceptance:
- [ ] Any event member creates polls (single or multi choice); votes changeable until close.
- [ ] `show_results` = always | after_close; anonymous polls never expose voter→option (enforced in API shape, not just UI).
- [ ] Applying an option records `applied_option_id` and updates the event field; the poll remains visible with full results — applied ≠ erased.

### F9. Guests (+1s) — **Should**

Stories:
- As a member (when `allow_guests` is on), I want to add "Ana, guest of mine" so headcount and costs include her.
- As an organizer, I want to promote a recurring guest to a real account so she becomes a member properly.

Acceptance:
- [ ] Guests count in headcount and capacity; appear in roster under their host; host or organizer can remove.
- [ ] Guests can be included in expense splits; their unpaid shares roll up to the host's balance.
- [ ] Promotion creates a pre-filled invitation; on claim, shares re-point to the new user; guest row keeps history (`promoted_to_user_id`).

### F10. Notifications — **Must** (matrix in [07](07-notifications.md))

Acceptance:
- [ ] Outbox decouples triggers from delivery; per-user channel preference (default: WhatsApp if number known, else email; email as backup always allowed).
- [ ] v0 triggers: invited, event scheduled, confirm reminder, contribution assigned, waitlist promoted, new poll, settle-up posted, pending-account (admin).
- [ ] Failures fall back to the other channel and are visible in the admin panel.

### F11. App admin panel — **Must**

Acceptance:
- [ ] Pending queue with one-toggle verify; deactivate/reactivate any account; see a user's channels, clubs, events.
- [ ] Admin actions are RPC-gated (`is_app_admin`) and activity-logged.
- [ ] Outbox health visible (queued/sent/failed).

---

## Permission matrix

| Action | Guest | Member | Organizer | Club admin | App admin |
|---|---|---|---|---|---|
| View event/club content | ❌ (via host) | ✅ | ✅ | ✅ | ✅ |
| RSVP, paint availability, vote | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create contribution **for self** / claim open | ❌ | ✅ | ✅ | ✅ | ✅ |
| Assign contribution **to others** / post open needs | ❌ | ❌ | ✅ | ✅ | ✅ |
| Create polls | ❌ | ✅ | ✅ | ✅ | ✅ |
| Apply poll option to event | ❌ | ❌ | ✅ | ✅ | ✅ |
| Add expenses | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit/delete others' expenses | ❌ | ❌ | ✅ | ✅ | ✅ |
| Add guests (if allowed) | ❌ | ✅ (own) | ✅ | ✅ | ✅ |
| Create/edit event, pick slot, invite, manage waitlist | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage club, categories, roster roles | ❌ | ❌ | ❌ | ✅ | ✅ |
| Verify/deactivate accounts, view all users | ❌ | ❌ | ❌ | ❌ | ✅ |

## Success metrics

Leading (first month of real use): share-link → completed availability+RSVP median **< 2 min**; ≥ **80%** of the club RSVPs in-app (not in chat); organizer chase messages for the pilot event = **0**; notification delivery success ≥ 95% on primary channel.
Lagging (quarter): **3 consecutive events** run fully in-app per active club; expenses settled within **7 days** of event for ≥ 80% of events; founder still prefers it over the spreadsheet (the honest metric).

## Open questions

- **WhatsApp sender number** — dedicated SIM/eSIM vs. virtual number for the Meta Business account? Owner: founder. *Blocks WhatsApp go-live, not development (sandbox covers dev).*
- **Confirm-deadline semantics** — flag-only (current spec) vs. auto-demote to `maybe`? Decide after first real event. Owner: founder + club. Non-blocking.
- **Category subscriptions (P2)** — per-member default-invite lists per category; design when clubs >1 category in practice. Non-blocking.

## Phasing

See [06-roadmap.md](06-roadmap.md). F1–F8, F10, F11 are v0 Must; F9 and apply-poll-winner are v0.5 Should; ledger/series/i18n/PWA/public are v1+.
