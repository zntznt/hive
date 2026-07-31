-- The sign-in code throttle, made real.
--
-- The 60 second limit was derived from the EXISTENCE of the signin_codes row,
-- and verifySigninCode deleted that row the moment the 5 attempt cap was hit.
-- So the loop was: request a code, burn six guesses, watch the throttle vanish
-- with the row, request again immediately. No IP limit, no lockout, no global
-- cap. Against a six digit code at roughly fifty guesses a second that is an
-- expected break in under three hours, and the prize is a full session for any
-- account whose WhatsApp number you know.
--
-- The counters live in their own table now, keyed by phone rather than by
-- user, so they survive the code row, and so an unknown number is limited on
-- exactly the same terms as a real one (a number that answers faster is a
-- number that has an account).
--
-- Everything here is service role only. signin_codes and phone_verifications
-- are already deny-all to anon and authenticated, and these counters are the
-- same class of secret.

create table if not exists public.signin_throttle (
  phone text primary key,
  last_sent_at timestamptz,
  sends int not null default 0,
  window_start timestamptz not null default now(),
  fails int not null default 0,
  locked_until timestamptz
);

alter table public.signin_throttle enable row level security;
revoke all on public.signin_throttle from public, anon, authenticated;

-- One send per minute, ten per number per day, and a lockout that outlives any
-- individual code. Returns whether the send may proceed and why not, taking a
-- row lock so two concurrent requests cannot both pass.
create or replace function public.signin_throttle_take(p_phone text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r public.signin_throttle;
  min_interval interval := interval '60 seconds';
  daily_cap int := 10;
begin
  insert into signin_throttle (phone) values (p_phone)
  on conflict (phone) do nothing;

  select * into r from signin_throttle where phone = p_phone for update;

  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('allowed', false, 'reason', 'locked');
  end if;

  -- a rolling 24 hour window, reset lazily rather than by a job
  if r.window_start < now() - interval '24 hours' then
    update signin_throttle set window_start = now(), sends = 0 where phone = p_phone;
    r.sends := 0;
  end if;

  if r.last_sent_at is not null and r.last_sent_at > now() - min_interval then
    return jsonb_build_object('allowed', false, 'reason', 'too_soon');
  end if;

  if r.sends >= daily_cap then
    return jsonb_build_object('allowed', false, 'reason', 'daily_cap');
  end if;

  update signin_throttle
     set last_sent_at = now(), sends = sends + 1
   where phone = p_phone;

  return jsonb_build_object('allowed', true);
end $$;

-- A wrong code. Counted per number and across codes, so requesting a fresh one
-- no longer buys a fresh budget of guesses. Ten failures inside the window and
-- the number is locked for fifteen minutes.
create or replace function public.signin_throttle_fail(p_phone text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  fail_cap int := 10;
  n int;
begin
  insert into signin_throttle (phone) values (p_phone)
  on conflict (phone) do nothing;

  update signin_throttle
     set fails = fails + 1
   where phone = p_phone
  returning fails into n;

  if n >= fail_cap then
    update signin_throttle
       set locked_until = now() + interval '15 minutes', fails = 0
     where phone = p_phone;
  end if;
end $$;

-- A code that worked clears the failure count, but deliberately not the send
-- counters: signing in successfully is not a reason to allow a hundred more
-- messages to that number today.
create or replace function public.signin_throttle_ok(p_phone text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update signin_throttle set fails = 0, locked_until = null where phone = p_phone;
$$;

-- The attempt counter was a read-modify-write over the network, so N parallel
-- wrong guesses all read 0 and all wrote 1. Concurrency multiplied the guesses
-- per increment; this makes one guess cost exactly one attempt.
create or replace function public.signin_code_attempt(p_user uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare n int;
begin
  update signin_codes set attempts = attempts + 1 where user_id = p_user
  returning attempts into n;
  return coalesce(n, 0);
end $$;

-- The phone-change table has the same read-modify-write on its attempt count.
create or replace function public.phone_verify_attempt(p_user uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare n int;
begin
  update phone_verifications set attempts = attempts + 1 where user_id = p_user
  returning attempts into n;
  return coalesce(n, 0);
end $$;

revoke execute on function public.phone_verify_attempt(uuid) from public, anon, authenticated;
revoke execute on function public.signin_throttle_take(text) from public, anon, authenticated;
revoke execute on function public.signin_throttle_fail(text) from public, anon, authenticated;
revoke execute on function public.signin_throttle_ok(text) from public, anon, authenticated;
revoke execute on function public.signin_code_attempt(uuid) from public, anon, authenticated;
