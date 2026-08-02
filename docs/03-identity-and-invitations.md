# 03 · Identity, Invitations & the Verification Gate

## Account model

A **user** is a real (but lightweight) account: display name + at least one **channel**: email and/or WhatsApp number. Both channels are linkable later from the profile. There are no passwords anywhere.

- Auth provider: **Supabase Auth**. One auth user may carry both `email` and `phone`.
- Sign-in methods:
  - **Email magic link** (`signInWithOtp`), ships in v0.
  - **WhatsApp OTP** (Supabase phone auth, `channel: 'whatsapp'` via Twilio Verify), for phone-only users; activates with the Twilio setup (see [07-notifications.md](07-notifications.md)).
- A `public.users` profile row mirrors each auth user (created by trigger on signup).

**Why no device secrets / PINs:** recovery must be *web-based*: from any device, a user requests a fresh magic link / OTP to a channel they own. Losing a phone never means losing an identity.

## Account lifecycle & the verification gate

```
(invited) ──sign-in──▶ pending ──app admin verifies──▶ active ──admin──▶ disabled
                          │                                            (reversible)
                          └── sees only the "waiting for verification" screen
```

- **The app admin has final say on who holds an account.** Every account carries a verification toggle; only `active` users get past the waiting screen.
- New accounts start **`pending`**, *except* accounts arriving through an invitation created by the app admin, which auto-activate (`invitations.auto_activate = true`, set only when the inviter is app admin).
- Enforcement is at the **database layer**: every RLS policy includes `is_active_user()`. A pending user is invisible to all club/event data regardless of which URL or API call they try.
- The app admin receives a notification (WhatsApp/email) when a new account lands in the pending queue. Verifying is one toggle in the admin panel.
- `disabled` users keep their historical rows (attendance, expenses) but cannot sign in or be selected for new activity.

## Role hierarchy

| Role | Scope | Powers (cumulative downward) |
|---|---|---|
| **App admin** | instance | user administration (verify/deactivate), see everything, all club powers |
| **Club admin** | club | edit club, categories, roster roles; organizer powers on all club events |
| **Event organizer** | event | edit event, pick slot, invite, assign contributions to others, apply poll winners, manage guests/waitlist |
| **Member** | club/event | RSVP, paint availability, self-volunteer contributions, claim unassigned ones, create polls, vote, add expenses, bring guests (if allowed) |
| **Guest** | event | none. Guests are data, not actors; they act through their host |

## Flows

### 1. Invite (organizer → new or known person)
1. Organizer enters an email and/or WhatsApp number (or picks from the club roster).
2. `invitations` row created: target (club and/or event), role, channel address(es), unguessable `token`, `auto_activate` iff inviter is app admin.
3. Notification goes out with the personal invite link (`/i/{token}`), WhatsApp-first.
4. Recipient taps → identifies the channel they were invited on → magic link / OTP → account exists (`pending` or `active`), invitation marked claimed, club/event memberships attached automatically (an RPC matches by invitation token, falling back to verified email/phone equality for older invites).

### 2. Share link in the WhatsApp group
Every event has `/e/{slug}` (unguessable slug). Behavior on tap, by `join_policy`:
- `club_members_only` (default): signed-in club members get straight in (auto-added to the event); strangers see a "this event belongs to a club" screen with a "request access" path that pings the organizer.
- `anyone_with_link`: any *active* signed-in user joins as event member; signed-out visitors are walked through sign-in first (new accounts land `pending` → verification gate still applies).
- `invite_only`: only pre-invited members get in; everyone else sees event title + organizer contact only.

The share link never leaks data before authorization: title-only preview, no roster, no money.

### 3. Returning sign-in (any device)
Enter email **or** WhatsApp number → receive link/OTP → session. No passwords, nothing device-bound.

### 4. Channel linking (profile)
Signed-in user adds the other channel (verify via OTP to that channel, Supabase `updateUser`). After linking, either channel signs them in and both receive notifications per their preferences.

### 5. Guest promotion
Host or organizer taps "promote to account" on a guest → pre-filled invitation (name from guest row) → on claim, `guests.promoted_to_user_id` is set and an RPC re-points the guest's `expense_shares` to the new user. History stays intact; future events invite them directly. The new account follows the normal lifecycle (`pending` unless app admin invited).

## Threat model (friend-group scale, admin-gated instance)

| Threat | Stance |
|---|---|
| Share link leaks outside the group | Title-only preview; join gated by policy + verification gate; worst case a stranger lands in the pending queue and is never verified |
| Magic link forwarded/intercepted | Links are single-use and short-lived (Supabase default); sessions are per-device; sensitive actions (verification, money edits) are role-gated and logged |
| Impersonation at invite time (wrong number/email) | Inviter sees what they typed; activity log records claims; admin can disable and re-invite |
| Pending-user data exposure | RLS `is_active_user()` on every policy, enforced in Postgres, not in page guards |
| Member mischief (fake expenses, reassigning items) | Permission rules in RPCs + append-only `activity_log` ("audit over locks"); organizers can correct |
| PII (names, emails, phones of friends) | Minimal collection, EU-hosted Supabase region, no analytics on personal data in v0; export/delete tooling before any public phase |

Out of scope for now (revisit before public phase): abuse/rate-limit hardening beyond Supabase defaults, CAPTCHA, SSO, account deletion self-service.
