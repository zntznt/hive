-- A database built from this folder was unusable by the app.
--
-- Every table here has RLS and a policy, and every policy was doing its job.
-- What was missing is the layer underneath: `anon` and `authenticated` held no
-- SELECT, INSERT, UPDATE or DELETE on a single table in `public`, so Postgres
-- refused every read before RLS was ever consulted. Signing in worked, and
-- then the first query returned "permission denied for table users", the
-- profile came back null, and the gate sent the person to the sign-in screen
-- they had just come from.
--
-- Production never had the problem, which is why it went unseen for so long.
-- Its tables were created through Supabase's own API, where a default
-- privilege grants the two roles everything on anything new in `public`. A
-- `supabase db reset` replays these files as `postgres`, that default does not
-- apply, and the result is a schema that looks complete and cannot answer a
-- question. `sandbox:reset` exists to catch exactly this class of thing and
-- this is the third time it has earned its keep.
--
-- Granting everything at the table level and gating on RLS is not a loosening,
-- it is Supabase's normal posture and it is what production already has: these
-- grants are verbatim what `bjtzrqiefjgohgwjjkfx` reports today, so applying
-- this there changes nothing. The privilege says "you may address this table";
-- the policy decides which rows come back, and that has not moved.

grant usage on schema public to anon, authenticated;

grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant all on all routines in schema public to anon, authenticated;

-- And for whatever a later migration adds, so this file does not have to be
-- remembered and re-run by hand every time the schema grows.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on routines to anon, authenticated;

-- The one table the two roles are deliberately kept off, matching production.
-- It records failed sign-in attempts per address, so a caller who can read it
-- can enumerate who has an account and a caller who can write it can clear
-- their own throttle. Only the service role touches it.
do $$
begin
  if to_regclass('public.signin_throttle') is not null then
    execute 'revoke all on public.signin_throttle from anon, authenticated';
  end if;
end $$;
