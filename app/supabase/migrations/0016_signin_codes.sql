-- 0016: sign in over WhatsApp with a one-time code.
--
-- The link version cannot exist. Meta rejected it as UTILITY and as MARKETING
-- with the same INCORRECT_CATEGORY, because it recognises a sign-in message
-- and requires the AUTHENTICATION category, which only accepts a one-time
-- code with a copy-code button. An authentication template submitted in that
-- shape was approved in seconds rather than sitting in review for days.
--
-- So the flow becomes: send a six digit code, verify it here, and only then
-- mint the Supabase session server-side. The member never handles a token.

create table if not exists public.signin_codes (
  user_id uuid primary key references public.users(id) on delete cascade,
  -- never the code itself: this table is readable by anyone who reaches the
  -- database, and a plaintext code there is a standing account takeover
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

-- One row per member, replaced on each request, so asking for a new code
-- silently invalidates the previous one.
alter table public.signin_codes enable row level security;

-- No policies on purpose. Only the service role touches this table, and the
-- service role bypasses RLS. A member has no reason to read even their own
-- hash, and the sign-in form runs unauthenticated anyway.

comment on table public.signin_codes is
  'One-time WhatsApp sign-in codes. Service role only; no RLS policies by design.';
