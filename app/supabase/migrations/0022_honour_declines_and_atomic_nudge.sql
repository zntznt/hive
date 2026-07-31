-- Three things an audit found, all of them mine from this week.
--
-- Both functions below are recreated from the LIVE definitions, not from the
-- ones in 0001. Those two drifted (organizer role handling, the privilege
-- guard bypass, jsonb return) and rewriting from the repo copy would have
-- silently reverted a month of fixes.

-- 1. A decline that nothing read.
--
-- 0020 added invitations.declined_at and the badge that shows it, but neither
-- function that matters looked at it. handle_new_user auto-claims any unclaimed
-- invitation matching a new signup's email or phone, so someone who said "no
-- puedo" and later joined Hive for their own reasons was put in the club anyway
-- and the organizer's "no puede" flipped to "aceptada".
--
-- The rule: a decline blocks the automatic match by address, and only that.
-- Presenting the token is an explicit accept and clears the decline, because
-- "cambié de opinión" is the whole reason the undo exists.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  inv record;
  new_status user_status := 'pending';
  dname text;
  admin record;
  tok text;
begin
  tok := new.raw_user_meta_data->>'invite_token';
  dname := coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, new.phone, 'socio'), '@', 1));
  if exists (select 1 from app_config where admin_email is not null and admin_email = new.email) then
    new_status := 'active';
  end if;
  for inv in
    select * from invitations i where i.claimed_by_user_id is null and (
      (tok is not null and i.token = tok)
      or (i.declined_at is null and new.email is not null and i.email = new.email)
      or (i.declined_at is null and new.phone is not null and i.phone = new.phone))
  loop
    if inv.auto_activate then new_status := 'active'; end if;
  end loop;

  insert into users (id, display_name, email, phone_whatsapp, status, is_app_admin)
  values (new.id, dname, new.email, nullif(new.phone, ''), new_status,
          exists (select 1 from app_config where admin_email is not null and admin_email = new.email));

  for inv in
    select * from invitations i where i.claimed_by_user_id is null and (
      (tok is not null and i.token = tok)
      or (i.declined_at is null and new.email is not null and i.email = new.email)
      or (i.declined_at is null and new.phone is not null and i.phone = new.phone))
  loop
    update invitations
       set claimed_by_user_id = new.id, claimed_at = now(), declined_at = null
     where id = inv.id;
    if inv.club_id is not null then
      insert into club_members (club_id, user_id, role)
      values (inv.club_id, new.id,
              case when inv.invited_role = 'admin' then 'admin'::club_role
                   when inv.invited_role = 'organizer' then 'organizer'::club_role
                   else 'member' end)
      on conflict do nothing;
    end if;
    if inv.event_id is not null then
      insert into event_members (event_id, user_id) values (inv.event_id, new.id) on conflict do nothing;
    end if;
    if inv.guest_id is not null then
      update guests set promoted_to_user_id = new.id where id = inv.guest_id;
      update expense_shares es set user_id = new.id, guest_id = null
        where es.guest_id = inv.guest_id
        and not exists (select 1 from expense_shares e2
                        where e2.expense_id = es.expense_id and e2.user_id = new.id);
      delete from expense_shares where guest_id = inv.guest_id;
    end if;
  end loop;

  if new_status = 'pending' then
    for admin in select id from users where is_app_admin and status = 'active'
    loop
      -- pending_user_id is what the waiting room's own nudge dedupes on, so
      -- without it the signup notice and the nudge could not see each other
      -- and someone could nudge admins the moment they arrived
      insert into notification_outbox (user_id, channel, template, payload)
      values (admin.id, 'email', 'admin_pending_user',
              jsonb_build_object('pending_user', dname, 'pending_user_id', new.id::text));
    end loop;
  end if;
  return new;
end $function$;

-- Accepting explicitly overrides an earlier decline, same rule.
create or replace function public.claim_invitation(invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare inv record; ev_slug text; cl_slug text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into inv from invitations where token = invite_token;
  if inv.id is null then raise exception 'invitation not found'; end if;
  if inv.claimed_by_user_id is not null and inv.claimed_by_user_id <> auth.uid() then
    raise exception 'invitation already claimed by another account';
  end if;

  if inv.club_id is not null then
    insert into club_members (club_id, user_id, role)
    values (inv.club_id, auth.uid(),
            case when inv.invited_role = 'admin' then 'admin'::club_role
                 when inv.invited_role = 'organizer' then 'organizer'::club_role
                 else 'member' end)
    on conflict do nothing;
    select slug into cl_slug from clubs where id = inv.club_id;
  end if;
  if inv.event_id is not null then
    insert into event_members (event_id, user_id) values (inv.event_id, auth.uid())
    on conflict do nothing;
    select slug into ev_slug from events where id = inv.event_id;
  end if;
  if inv.guest_id is not null then
    update guests set promoted_to_user_id = auth.uid() where id = inv.guest_id;
    update expense_shares es set user_id = auth.uid(), guest_id = null
      where es.guest_id = inv.guest_id
      and not exists (select 1 from expense_shares e2
                      where e2.expense_id = es.expense_id and e2.user_id = auth.uid());
    delete from expense_shares where guest_id = inv.guest_id;
  end if;
  if inv.auto_activate then
    perform set_config('hive.bypass_privilege_guard', 'on', true);
    update users set status = 'active' where id = auth.uid() and status = 'pending';
    perform set_config('hive.bypass_privilege_guard', '', true);
  end if;

  -- clearing declined_at is the only change here: opening the link is an
  -- explicit yes, and it has to beat an earlier no
  update invitations set claimed_by_user_id = auth.uid(), claimed_at = now(), declined_at = null
  where id = inv.id and claimed_by_user_id is null;

  return jsonb_build_object('event_slug', ev_slug, 'club_slug', cl_slug);
end $function$;

-- 2. A rate limit that did not limit anything.
--
-- claim_admin_nudge was named "claim" and claimed nothing: it read the outbox,
-- returned admin ids, and left the application to write the row that would make
-- the next check fail, over the network, in another transaction. Two taps inside
-- that window both passed and every admin got the message twice.
--
-- It does the whole thing now, in one transaction, behind a per-user advisory
-- lock. The channel choice mirrors queueNotification's fallback for a template
-- with no topic: the global toggle, then whichever address exists.
drop function if exists public.claim_admin_nudge();

create or replace function public.nudge_admins()
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  dname text;
  queued int := 0;
begin
  if uid is null then return 0; end if;
  select display_name into dname from users where id = uid and status = 'pending';
  if not found then return 0; end if;

  -- serialises two concurrent callers for the same account: the second blocks
  -- until the first commits, and then sees its row
  perform pg_advisory_xact_lock(hashtext('nudge_admins:' || uid::text));

  if exists (
    select 1 from notification_outbox
     where template = 'admin_pending_user'
       and payload->>'pending_user_id' = uid::text
       and created_at > now() - interval '24 hours'
  ) then
    return 0;
  end if;

  insert into notification_outbox (user_id, channel, template, payload)
  select a.id,
         (case when coalesce(a.notif_email, true) and a.email is not null then 'email'
               else 'whatsapp' end)::notif_channel,
         'admin_pending_user',
         jsonb_build_object('pending_user', coalesce(dname, 'Alguien'), 'pending_user_id', uid::text)
    from users a
   where a.is_app_admin and a.status = 'active'
     and (a.email is not null or a.phone_whatsapp is not null);

  get diagnostics queued = row_count;
  return queued;
end;
$$;

-- 3. Grants that were not a boundary.
--
-- "grant execute to authenticated" restricts nothing: Postgres gives PUBLIC
-- execute on every new function and Supabase does not revoke it, so anon
-- already held it. Nothing was exploitable, because each of these carries its
-- own auth.uid() check, but the grant read like a fence and was not one.
-- PUBLIC is the Postgres default; anon is Supabase's own default grant. Both
-- have to go, or the revoke reads as a fence and is not one.
revoke execute on function public.pending_queue_status() from public, anon;
revoke execute on function public.nudge_admins() from public, anon;
revoke execute on function public.decline_invitation(text, boolean) from public;
grant execute on function public.pending_queue_status() to authenticated;
grant execute on function public.nudge_admins() to authenticated;
grant execute on function public.decline_invitation(text, boolean) to anon, authenticated;
