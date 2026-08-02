# Hive 🐝

Club-centric social event coordination: find the time (crab.fit-style grid) → confirm who's in → decide with polls → see who brings what → split what it cost. Invite-based accounts (email / WhatsApp, magic links, no passwords), admin-gated while it serves our own clubs, WhatsApp-first notifications. Cozy, bug-inspired, never ham-fisted ([docs/08](docs/08-brand-and-tone.md)).

## Repo layout

| Path | What |
|---|---|
| `docs/01…08` | Planning pack: competitive scan, product brief, identity & invitations, data model, feature spec (PRD), roadmap + requirements cross-check, notifications/WhatsApp strategy, brand & tone |
| `wireframes/index.html` | Low-fi grayscale wireframes of the 11 key screens (open in any browser) |
| `app/` | Next.js 16 + Supabase scaffold with the v0 vertical slice |
| `app/supabase/migrations/0001_init.sql` | Full schema: tables, RLS, triggers, RPCs, derived views |
| `app/supabase/seed.sql` | Demo club «Los Jueves» with history, balances, grid, poll, contributions |
| `app/supabase/rls-test.sql` | Permission-rule assertions (contributions model + verification gate) |

## Status (verified)

- ✅ `npm run build` passes (Next 16.2, TS strict)
- ✅ All 4 migrations applied cleanly to the `hive-us` Supabase project (`bjtzrqiefjgohgwjjkfx`, us-east-1, free tier). Currency is MXN. The old `hive-dev` (eu-west-1) is paused, kept as a fallback.
- ✅ Seed loaded; derived views return correct balances (±1 cent documented rounding) and attendance
- ✅ RLS tests pass: members can self-volunteer and claim open contributions but cannot assign to others; organizers can; `pending` accounts see zero rows
- ✅ Auth uses getClaims (local JWT verify, ES256) on the navigation hot path, not a per-page network round trip

## Try it

```bash
cd app && npm run dev   # .env.local already points at hive-us
```

1. Open http://localhost:3000 and sign in with the email set as `admin_email` in `app_config` (already configured on the hive-us project; magic link. Supabase's built-in mailer delivers to project owners, so configure SMTP before inviting others).
2. Your account auto-activates (app admin via `app_config`) and auto-joins the demo club through a seeded invitation. That's the invite flow working.
3. Browse: `/club/los-jueves` (categories, history, attendance), then «Twilight Imperium» (paint the grid, best slots, Fijar as organizer), «Noche de Catan» (RSVP states), and `/admin` (Ana waits in the pending queue to verify).

Demo people (Marta organizer/demo-admin, Jorge, Lucía, Pablo, Ana-pending) are seed rows without passwords, so they can't sign in; act as yourself.

## Built so far (beyond the original slice)

Club/event/category **creation flows** · **invite manager** with copyable personal links (`/i/{token}` landing claims by token, attaches club+event, auto-activates app-admin invites) · **expenses & balances UI** (participant picker incl. guests, min-cashflow settle-up suggestions, settlement record + confirm) · share-link copy on every event.

## Deliberately not built yet (designed, see docs/06)

Polls **UI** · notification **delivery** (events queue into the outbox; email adapter then WhatsApp adapter are next; invite links are copy-paste-into-WhatsApp by design until then) · add-guest / promote-guest UI · timezone-exact grid rendering (renders viewer-local) · Realtime heatmap updates.

## Production notes

- Rotate nothing: the committed `.env.local` holds only the publishable (anon) key, safe client-side by design; RLS is the boundary.
- Auth email templates, SMTP (Resend), and redirect URLs need real values before inviting the club.
- The repo inside `app/` is a fresh git repo from create-next-app; `docs/` and `wireframes/` live outside it. Move them in (or `git init` at this root) when you want everything versioned together.
