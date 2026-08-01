-- Signing in with a code, over email as well as WhatsApp.
--
-- The code mechanism was built for WhatsApp because Meta leaves no choice: an
-- AUTHENTICATION template is the only category they approve for sign-in, and
-- it carries a one-time code and nothing else. Email was left on a magic link,
-- so the same app asked you to type six digits on one channel and hunt for a
-- tappable link on the other, and the link is the worse half: it opens in
-- whatever browser the mail app prefers, which is not the one holding the
-- session, and on a phone that is most of the reason a sign-in fails.
--
-- Two things had to give.
--
-- 1. The throttle was keyed by a column called `phone`, and an email is not a
--    phone. The limiter itself never cared: it rate-limits a contact string,
--    one send a minute, ten a day, and a lockout that outlives any single
--    code. Renaming it is the whole change. Leaving it called `phone` while
--    passing addresses through it is the kind of lie that reads as a bug to
--    whoever opens this table next.
--
-- 2. notification_outbox has a foreign key on (channel, template), so an
--    email sign-in could not even be recorded without a row here. That FK is
--    load-bearing: signin_code once had no matching row and four sign-ins
--    vanished with nothing written down.

alter table public.signin_throttle rename column phone to contact;

-- The three functions are recreated rather than altered: a plpgsql body that
-- names a column that no longer exists fails at call time, not at rename time,
-- which would have made the next sign-in the thing that discovered it.
drop function if exists public.signin_throttle_take(text);
drop function if exists public.signin_throttle_fail(text);
drop function if exists public.signin_throttle_ok(text);

-- One send per minute, ten per contact per day, and a lockout that outlives
-- any individual code. Returns whether the send may proceed and why not,
-- taking a row lock so two concurrent requests cannot both pass.
create or replace function public.signin_throttle_take(p_contact text)
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
  insert into signin_throttle (contact) values (p_contact)
  on conflict (contact) do nothing;

  select * into r from signin_throttle where contact = p_contact for update;

  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('allowed', false, 'reason', 'locked');
  end if;

  -- a rolling 24 hour window, reset lazily rather than by a job
  if r.window_start < now() - interval '24 hours' then
    update signin_throttle set window_start = now(), sends = 0 where contact = p_contact;
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
   where contact = p_contact;

  return jsonb_build_object('allowed', true);
end $$;

-- A wrong code. Counted per contact and across codes, so requesting a fresh
-- one no longer buys a fresh budget of guesses. Ten failures inside the window
-- and the contact is locked for fifteen minutes.
create or replace function public.signin_throttle_fail(p_contact text)
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
  insert into signin_throttle (contact) values (p_contact)
  on conflict (contact) do nothing;

  update signin_throttle
     set fails = fails + 1
   where contact = p_contact
  returning fails into n;

  if n >= fail_cap then
    update signin_throttle
       set locked_until = now() + interval '15 minutes', fails = 0
     where contact = p_contact;
  end if;
end $$;

-- A code that worked clears the failure count, but deliberately not the send
-- counters: signing in successfully is not a reason to allow a hundred more
-- messages to that address today.
create or replace function public.signin_throttle_ok(p_contact text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update signin_throttle set fails = 0, locked_until = null where contact = p_contact;
$$;

revoke execute on function public.signin_throttle_take(text) from public, anon, authenticated;
revoke execute on function public.signin_throttle_fail(text) from public, anon, authenticated;
revoke execute on function public.signin_throttle_ok(text) from public, anon, authenticated;

-- The outbox row an email sign-in writes needs something to point at. Subject
-- and body live here so the code is not the only place they exist, matching
-- every other template; the code renders {{codigo}} at send time.
insert into notification_templates (channel, key, subject, body)
values (
  'email',
  'signin_code',
  'Tu código para entrar a Hive: {{codigo}}',
  'Tu código es {{codigo}}. Vence en 10 minutos. Si no lo pediste, ignora este correo.'
)
on conflict (channel, key) do nothing;
