# 04 — Data Model

*Source of truth for the Supabase migrations in `app/supabase/migrations/`. Postgres 15+, Supabase conventions (`auth.users` is the identity root).*

## Design rules

1. **Everything derived is a view** — attendance and balances are never hand-maintained tables.
2. **The verification gate lives in RLS** — `is_active_user()` appears in every policy.
3. **Permission-sensitive writes go through RPCs** (`security definer` functions), so rules like "members self-assign only" are enforced server-side once.
4. **Ledger-ready, not ledger-on:** expenses hang off events (required) which hang off clubs; the future running ledger is an aggregation change, not a migration.
5. Money is `integer` cents + ISO currency; times are `timestamptz`; availability is UTC slot indexes.

## Enums

```sql
create type user_status as enum ('pending','active','disabled');
create type club_role as enum ('admin','member');
create type event_role as enum ('organizer','member');
create type event_status as enum ('draft','scheduling','scheduled','done','cancelled');
create type join_policy as enum ('club_members_only','anyone_with_link','invite_only');
create type rsvp_status as enum ('in','out','maybe');
create type contribution_kind as enum ('bring','task');
create type poll_kind as enum ('single','multi');
create type poll_results_visibility as enum ('always','after_close');
create type notif_channel as enum ('whatsapp','email');
create type notif_status as enum ('queued','sent','failed','logged');
create type invite_status as enum ('invited','joined');
```

## Tables

```sql
-- Mirrors auth.users (insert via trigger handle_new_user)
users (
  id uuid pk references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_color text,
  email citext unique,            -- mirror of auth email (nullable)
  phone_whatsapp text unique,     -- E.164, mirror of auth phone (nullable)
  status user_status not null default 'pending',
  is_app_admin boolean not null default false,
  verified_by uuid references users(id),
  verified_at timestamptz,
  created_at timestamptz default now()
)  -- check: email is not null or phone_whatsapp is not null

clubs (
  id uuid pk default gen_random_uuid(),
  slug text unique not null,      -- unguessable, base58 ~12 chars
  name text not null,
  currency char(3) not null default 'EUR',
  settings jsonb not null default '{}',
  created_by uuid references users(id),
  created_at timestamptz default now()
)

club_members (
  club_id uuid references clubs on delete cascade,
  user_id uuid references users on delete cascade,
  role club_role not null default 'member',
  joined_at timestamptz default now(),
  primary key (club_id, user_id)
)

event_categories (
  id uuid pk default gen_random_uuid(),
  club_id uuid not null references clubs on delete cascade,
  name text not null,             -- "board games", "scrapbooking", "wargaming", "movies"
  emoji text, color text,
  unique (club_id, name)
)

events (
  id uuid pk default gen_random_uuid(),
  club_id uuid references clubs on delete cascade,        -- nullable: standalone one-offs
  category_id uuid references event_categories,
  slug text unique not null,                              -- the share link
  title text not null,
  description text, location text,
  status event_status not null default 'draft',
  organizer_user_id uuid not null references users(id),
  join_policy join_policy not null default 'club_members_only',
  allow_guests boolean not null default false,
  capacity int,                       -- null = unlimited (optional setting)
  waitlist_enabled boolean not null default false,
  confirm_deadline timestamptz,       -- null = no hard re-confirm (optional setting)
  sched_start_date date, sched_end_date date,             -- availability window
  sched_time_min smallint, sched_time_max smallint,       -- minutes from midnight UTC
  sched_slot_minutes smallint not null default 30,
  chosen_start timestamptz, chosen_end timestamptz,
  settings jsonb not null default '{}',
  created_at timestamptz default now()
)

event_members (
  event_id uuid references events on delete cascade,
  user_id uuid references users on delete cascade,
  role event_role not null default 'member',
  invite_status invite_status not null default 'invited',
  primary key (event_id, user_id)
)

invitations (
  id uuid pk default gen_random_uuid(),
  club_id uuid references clubs on delete cascade,
  event_id uuid references events on delete cascade,      -- at least one target
  email citext, phone text,                               -- at least one channel
  invited_role text not null default 'member',
  token text unique not null,
  auto_activate boolean not null default false,           -- true only when inviter is app admin
  invited_by uuid not null references users(id),
  claimed_by_user_id uuid references users(id),
  claimed_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz default now()
)

availability (
  event_id uuid references events on delete cascade,
  user_id uuid references users on delete cascade,
  slots int[] not null default '{}',   -- indexes into the event's UTC grid
  updated_at timestamptz default now(),
  primary key (event_id, user_id)
)

rsvps (
  event_id uuid references events on delete cascade,
  user_id uuid references users on delete cascade,
  status rsvp_status not null,
  confirmed_at timestamptz,            -- set when re-confirming within confirm window
  waitlist_pos int,                    -- non-null = waiting (capacity full)
  updated_at timestamptz default now(),
  primary key (event_id, user_id)
)

guests (
  id uuid pk default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  host_user_id uuid not null references users(id),
  name text not null,
  promoted_to_user_id uuid references users(id),
  created_at timestamptz default now()
)

contributions (
  id uuid pk default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  kind contribution_kind not null default 'bring',
  title text not null,
  qty text,                            -- "2 bags", "6 packs" — text beats numeric here
  created_by uuid not null references users(id),
  assigned_to uuid references users(id),   -- null = open need, claimable
  due timestamptz,
  done boolean not null default false,
  created_at timestamptz default now()
)
-- write rule (enforced in RPC create/claim/assign):
--   organizers: anything. members: create with assigned_to = self,
--   or claim open rows (assigned_to null → self). nobody else's rows.

expenses (
  id uuid pk default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  payer_user_id uuid not null references users(id),
  amount_cents int not null check (amount_cents > 0),
  currency char(3) not null,
  note text not null,
  spent_at timestamptz not null default now(),
  created_by uuid not null references users(id)
)

expense_shares (
  expense_id uuid references expenses on delete cascade,
  user_id uuid references users(id),
  guest_id uuid references guests(id),
  weight numeric not null default 1,   -- equal split = weight 1 each; custom = arbitrary
  check ((user_id is null) <> (guest_id is null)),
  primary key (expense_id, coalesce(user_id, guest_id))  -- implemented as unique index
)

settlements (
  id uuid pk default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  from_user uuid not null references users(id),
  to_user uuid not null references users(id),
  amount_cents int not null check (amount_cents > 0),
  confirmed boolean not null default false,   -- recipient confirms receipt
  created_at timestamptz default now()
)

polls (
  id uuid pk default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  created_by uuid not null references users(id),   -- any member may create
  question text not null,
  kind poll_kind not null default 'single',
  anonymous boolean not null default false,
  closes_at timestamptz,
  show_results poll_results_visibility not null default 'always',
  applied_option_id uuid,              -- fk to poll_options, added after both exist
  created_at timestamptz default now()
)

poll_options ( id uuid pk, poll_id uuid references polls on delete cascade, label text not null, sort int )
votes (
  poll_id uuid references polls on delete cascade,
  option_id uuid references poll_options on delete cascade,
  user_id uuid references users on delete cascade,
  primary key (poll_id, option_id, user_id)   -- multi-choice: one row per chosen option
)

notification_outbox (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null references users(id),
  channel notif_channel not null,
  template text not null,              -- e.g. 'event_scheduled', 'confirm_reminder'
  payload jsonb not null default '{}',
  status notif_status not null default 'queued',
  sent_at timestamptz, error text,
  created_at timestamptz default now()
)

activity_log (
  id bigint pk generated always as identity,
  club_id uuid, event_id uuid,
  user_id uuid not null references users(id),
  verb text not null,                  -- 'rsvp.confirmed', 'expense.added', 'user.verified'…
  payload jsonb not null default '{}',
  at timestamptz default now()
)
```

## Derived views

```sql
-- Who attended what: RSVP 'in' on a 'done' event counts as attendance
attendance_stats(club_id, user_id, category_id, events_attended, last_attended_at)
  = rsvps ⨝ events where events.status='done' and rsvps.status='in'
    group by club, user, category (plus an all-categories rollup with category_id null)

-- Per-event net positions. Guest shares resolve to the host.
event_balances(event_id, user_id, paid_cents, owed_cents, net_cents)
  owed = Σ over expense_shares (resolving guest_id → guests.host_user_id)
         of expense.amount_cents * weight / Σweights(expense)
  paid = Σ expenses where payer
  net  = paid - owed + settlements_in - settlements_out (confirmed only)
```

Settle-up suggestions (min-cashflow) are computed in the app from `event_balances` — pure function, no storage.

## Access control

```sql
-- helpers (security definer, stable)
is_active_user()                -- auth.uid() has users.status = 'active'
is_app_admin()
is_club_member(club_id) / is_club_admin(club_id)
is_event_member(event_id) / is_event_organizer(event_id)  -- club admins count as organizers
```

- **Every** RLS policy starts with `is_active_user()` — the verification gate is in Postgres, not page guards.
- Reads: club data visible to club members; event data to event members (and club members for club events).
- Simple writes via RLS (own availability, own RSVP, own votes).
- Rule-bearing writes via RPCs: `claim_invitation(token)`, `join_via_share_link(slug)`, `create_contribution`, `claim_contribution`, `assign_contribution`, `add_expense_with_shares`, `promote_guest`, `apply_poll_option`, `pick_slot`, `admin_set_user_status` (app admin only), `rsvp_with_capacity` (handles capacity/waitlist atomically).
- `users`: a user can read/update own row (not `status`/`is_app_admin`); app admin reads all, mutates status via RPC.
- `notification_outbox`/`activity_log`: insert via triggers/RPCs; users read their own notifications; activity readable by the relevant club/event members.

## Indexes (beyond PKs/uniques)

`events(club_id, status)`, `events(category_id)`, `event_members(user_id)`, `rsvps(user_id)`, `expenses(event_id)`, `expense_shares(user_id)`, `contributions(event_id, assigned_to)`, `invitations(email)`, `invitations(phone)`, `votes(user_id)`, `activity_log(event_id, at desc)`, `notification_outbox(status)`.

## Triggers

- `on auth.users insert → handle_new_user()`: create `users` row (status from matching invitation's `auto_activate`, else `pending`; display name from invitation or email local-part), claim matching invitations (token in user metadata, else channel equality), attach memberships, queue admin notification if pending.
- `on rsvps/expenses/contributions/polls write → log_activity()`.
- `updated_at` touch triggers on `availability`, `rsvps`.
