-- 0018: prove the number belongs to you before it becomes a way in.
--
-- phone_whatsapp started life as a delivery address, and saving one
-- unverified was fine for that: the worst outcome was your own notices going
-- somewhere else. Then sign-in by WhatsApp made it an identity, and the same
-- unverified write became a way to attach a number you do not own to an
-- account. A unique constraint already stops anyone claiming a number that is
-- on another account, so this was never a route into someone else's account,
-- but an identity nobody proved is not a property worth keeping.
--
-- The number is now held here until a code sent to it comes back, and only
-- then written to users.

create table if not exists public.phone_verifications (
  user_id uuid primary key references public.users(id) on delete cascade,
  -- the candidate number, not yet on the account
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.phone_verifications enable row level security;
-- No policies, like signin_codes: only the service role touches this, and a
-- member has no reason to read even their own hash.

comment on table public.phone_verifications is
  'Pending WhatsApp number changes. Service role only; no RLS policies by design.';

-- Null means the number predates verification existing. Those numbers keep
-- working, because invalidating them would lock people out of an account they
-- legitimately hold, but the UI can stop calling them verified.
alter table public.users
  add column if not exists phone_verified_at timestamptz;
