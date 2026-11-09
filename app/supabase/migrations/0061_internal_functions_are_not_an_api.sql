-- 0052 opened every function in `public` to the public key.
--
-- Its purpose was right and stays: a database built from these files has to
-- be usable by the app. But `grant all on all routines ... to anon,
-- authenticated` also re-granted everything 0029, 0033, 0034 and 0045 had
-- taken away, and its `alter default privileges` line did the same for every
-- function written since. So with nothing but the anon key, anybody could:
--
--   purge_deleted_events      delete every binned event, no auth check
--   signin_throttle_ok        clear the failed-attempt lockout for any
--                             contact, the guard against guessing their code
--   signin_throttle_take/fail and phone_verify_attempt, signin_code_attempt
--                             lock any account out of signing in
--   allocate_expense_shares, event_seats_taken
--                             internal helpers with no auth check of their own
--
-- Only approve_change_request was taken back since (0055).
--
-- Revoking from anon alone does nothing (0034 is the record of learning that):
-- Postgres gives EXECUTE on every new function to PUBLIC, and anon and
-- authenticated inherit it. So this takes PUBLIC, anon and authenticated off
-- every function the schema owns, then grants back exactly what a client
-- calls. service_role keeps its own direct grant from 0054, which none of
-- this touches. Functions that belong to an extension (citext lives in
-- `public`) are left alone: its operators call them as the querying role, and
-- revoking them would break every comparison on a citext column.

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and not exists (select 1 from pg_depend d
                        where d.classid = 'pg_proc'::regclass
                          and d.objid = p.oid
                          and d.deptype = 'e')
  loop
    execute format('revoke execute on routine %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Before anyone signs in, and after. The predicates appear inside RLS
-- policies, which run them as the querying role, so both roles have to be
-- able to execute them or every read fails with "permission denied for
-- function". Each answers about auth.uid(), which is null for anon. The rest
-- are the invite, join and calendar links, which take a token and render
-- before a session exists.
grant execute on function
  public.is_active_user(),
  public.is_app_admin(),
  public.is_club_member(uuid),
  public.is_club_admin(uuid),
  public.is_club_manager(uuid),
  public.is_event_member(uuid),
  public.is_event_organizer(uuid),
  public.can_see_event(uuid),
  public.get_invitation_preview(text),
  public.get_club_join_preview(text),
  public.get_club_calendar(text),
  public.decline_invitation(text, boolean)
to anon, authenticated;

-- Signed in only. Every one checks the caller itself.
grant execute on function
  public.add_expense_with_shares(uuid, integer, text, uuid[], uuid[]),
  public.admin_set_app_admin(uuid, boolean),
  public.admin_set_user_status(uuid, user_status),
  public.apply_poll_option(uuid, uuid),
  public.approve_change_request(uuid),
  public.approve_join_request(uuid),
  public.claim_invitation(text),
  public.confirm_rsvp(uuid),
  public.join_event(text),
  public.mark_attendance(uuid, uuid[], uuid[]),
  public.nudge_admins(),
  public.pending_queue_status(),
  public.pick_slot(uuid, timestamptz, timestamptz),
  public.poll_results(uuid),
  public.promote_guest(uuid, citext, text),
  public.promote_waitlist(uuid),
  public.replace_payment_methods(jsonb),
  public.request_account_deletion(),
  public.request_join_club(text),
  public.rotate_club_calendar_token(uuid),
  public.rsvp_set(uuid, rsvp_status),
  public.set_event_deleted(uuid, boolean),
  public.set_event_status(uuid, event_status)
to authenticated;

-- Everything else is service role (the throttle, the attempt counters, the
-- purge), an internal helper only other definer functions call, or a trigger.
-- Restated here so this file alone says what the service role can reach.
grant execute on all routines in schema public to service_role;

-- And the next function. Two defaults would hand it out again:
--
--   0052's, scoped to `public`, granting anon and authenticated. Revoked here.
--   Postgres's own EXECUTE to PUBLIC. That one is global and cannot be revoked
--   per schema ("default privileges specified per schema are added to the
--   global ones"), so it is revoked for the role that writes migrations. Its
--   reach is functions that `postgres` creates from now on, in any schema.
--
-- So a new function is service role only until a migration grants it. A new
-- policy helper needs `grant execute ... to anon, authenticated` next to it;
-- rls-test.sql fails until it has one. The defaults for tables and sequences
-- are not touched: those stay gated by RLS, as 0052 says.
alter default privileges for role postgres in schema public
  revoke execute on routines from anon, authenticated;
alter default privileges for role postgres
  revoke execute on routines from public;
