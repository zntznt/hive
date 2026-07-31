-- Being disabled was cosmetic.
--
-- is_active_user() existed and checked status, but the five helpers that
-- actually decide who may write anything did not use it:
--
--   is_club_member, is_club_admin, is_club_manager,
--   is_event_member, is_event_organizer
--
-- Each one asked "is there a membership row" and stopped there. Disabling an
-- account does not remove its membership rows, so an admin who disabled a
-- member changed nothing they could do: still RSVP, still add expenses, still
-- run the club they administer. The account only lost the pages that read
-- is_active_user() directly, which is the front door while every window is
-- open, and PostgREST is reachable with the public anon key.
--
-- The same hole is what made account deletion fake. request_account_deletion
-- sets status = 'disabled', so a "deleted" account kept every power it had.
--
-- Fixing it in the helpers rather than in the policies is deliberate: about
-- forty write policies conjoin one of these, and a rule enforced in forty
-- places is a rule that will be missed in the forty first.

create or replace function public.is_club_member(cid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select is_active_user() and exists
  (select 1 from club_members where club_id = cid and user_id = auth.uid()) $$;

create or replace function public.is_club_admin(cid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select is_app_admin() or (is_active_user() and exists
  (select 1 from club_members where club_id = cid and user_id = auth.uid() and role = 'admin')) $$;

create or replace function public.is_club_manager(cid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select is_app_admin() or (is_active_user() and exists
  (select 1 from club_members where club_id = cid and user_id = auth.uid() and role in ('admin', 'organizer'))) $$;

create or replace function public.is_event_member(eid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select is_active_user() and exists
  (select 1 from event_members where event_id = eid and user_id = auth.uid()) $$;

create or replace function public.is_event_organizer(eid uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select is_app_admin()
   or (is_active_user() and (
        exists (select 1 from events e where e.id = eid and
                (e.organizer_user_id = auth.uid()
                 or (e.club_id is not null and is_club_admin(e.club_id))))
        or exists (select 1 from event_members where event_id = eid and user_id = auth.uid() and role = 'organizer'))) $$;

-- Three definer RPCs that were reachable with no check of who was calling.
--
-- confirm_rsvp scoped its write to auth.uid(), so the worst case was a
-- disabled account confirming its own attendance; it is here for consistency.
-- promote_waitlist did not scope anything: any caller, including anon, could
-- name any event id and seat people off its waitlist. It is called from
-- rsvp_set (where the caller is already an event member) and from the
-- organizer's "abrir un lugar", so gating on being able to see the event
-- covers both. The auth.uid() escape keeps the service role, which the daily
-- job runs on, working.
create or replace function public.confirm_rsvp(eid uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_active_user() then raise exception 'account not active'; end if;
  update rsvps set confirmed_at = now()
   where event_id = eid and user_id = auth.uid() and status = 'in';
end $$;

create or replace function public.promote_waitlist(eid uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ev record; seated int; nxt record;
begin
  if auth.uid() is not null and not can_see_event(eid) then
    raise exception 'not your event';
  end if;
  select capacity, waitlist_enabled into ev from events where id = eid;
  if ev.capacity is null or not ev.waitlist_enabled then return; end if;
  loop
    select count(*) into seated from rsvps
      where event_id = eid and status = 'in' and waitlist_pos is null;
    exit when seated >= ev.capacity;
    select user_id, waitlist_pos into nxt from rsvps
      where event_id = eid and status = 'in' and waitlist_pos is not null
      order by waitlist_pos limit 1;
    exit when nxt.user_id is null;
    update rsvps set waitlist_pos = null where event_id = eid and user_id = nxt.user_id;
    insert into notification_outbox (user_id, channel, template, payload)
    values (nxt.user_id, 'email', 'waitlist_promoted', jsonb_build_object('event_id', eid));
  end loop;
end $$;

create or replace function public.replace_payment_methods(rows jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not is_active_user() then raise exception 'no autenticado'; end if;

  delete from payment_methods where user_id = uid;

  insert into payment_methods (user_id, kind, value, sort)
  select uid, r->>'kind', btrim(r->>'value'), (ordinality - 1)::int
    from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) with ordinality as t(r, ordinality)
   where btrim(coalesce(r->>'value', '')) <> '';
end $$;

create or replace function public.request_join_club(jtoken text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare cid uuid; mode club_join_mode; req_id uuid;
begin
  if not is_active_user() then raise exception 'sign in first'; end if;
  select id, join_mode into cid, mode from clubs where join_token = jtoken;
  if cid is null then raise exception 'invitation not found'; end if;
  if mode <> 'anyone_with_link' then raise exception 'this club is not open for join requests'; end if;
  if is_club_member(cid) then raise exception 'already a member'; end if;
  insert into club_join_requests (club_id, user_id) values (cid, auth.uid())
    on conflict (club_id, user_id) where status = 'pending' do nothing
    returning id into req_id;
  return req_id;
end $$;

-- Deleting an account should delete something.
--
-- This anonymized the display name and set status = 'disabled', which given
-- the helpers above meant nothing at all changed, and left email,
-- phone_whatsapp, payment details and saved addresses sitting in the table.
-- Both identity columns also still worked as sign-in lookups, so the screen's
-- promise ("no vas a poder volver a entrar") was false twice over.
--
-- Club memberships stay. Attendance, expenses and settlements are other
-- people's records too, and unpicking a membership would either orphan them or
-- rewrite a club's history to hide that someone was ever there. The row shows
-- as "Cuenta eliminada" and, with the helpers fixed, can do nothing.
create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sign in first'; end if;
  perform set_config('hive.bypass_privilege_guard', 'on', true);

  update users set
    display_name = 'Cuenta eliminada',
    avatar_photo_url = null,
    avatar_kind = 'bug',
    avatar_color = null,
    -- identity, which is also what both sign-in lookups key on
    email = null,
    phone_whatsapp = null,
    phone_verified_at = null,
    notif_email = false,
    notif_whatsapp = false,
    status = 'disabled'
  where id = uid;

  delete from payment_methods where user_id = uid;
  delete from saved_places where user_id = uid;
  delete from signin_codes where user_id = uid;
  delete from phone_verifications where user_id = uid;
  -- pending asks that would otherwise sit in someone's approvals queue under
  -- a name that no longer means anything
  delete from club_join_requests where user_id = uid and status = 'pending';

  perform set_config('hive.bypass_privilege_guard', '', true);
end $$;

-- Reachability, tightened. Everything below is either an internal helper that
-- only other definer functions should call, or an action that requires a
-- session, and none of it belongs to anon. PostgREST exposes every function
-- the role can execute, so a grant left at the default is a public endpoint.
revoke execute on function public.allocate_expense_shares(uuid) from public, anon, authenticated;
revoke execute on function public.promote_waitlist(uuid) from anon;
revoke execute on function public.confirm_rsvp(uuid) from anon;
revoke execute on function public.pick_slot(uuid, timestamptz, timestamptz) from anon;
revoke execute on function public.request_account_deletion() from anon;
revoke execute on function public.request_join_club(text) from anon;
revoke execute on function public.mark_attendance(uuid, uuid[]) from anon;
revoke execute on function public.promote_guest(uuid, citext, text) from anon;
revoke execute on function public.set_event_status(uuid, event_status) from anon;
revoke execute on function public.set_event_deleted(uuid, boolean) from anon;
revoke execute on function public.admin_set_user_status(uuid, user_status) from anon;
revoke execute on function public.admin_set_app_admin(uuid, boolean) from anon;
revoke execute on function public.approve_change_request(uuid) from anon;
revoke execute on function public.approve_join_request(uuid) from anon;
revoke execute on function public.apply_poll_option(uuid, uuid) from anon;
revoke execute on function public.add_expense_with_shares(uuid, integer, text, uuid[], uuid[]) from anon;
revoke execute on function public.join_event(text) from anon;
revoke execute on function public.rsvp_set(uuid, rsvp_status) from anon;
