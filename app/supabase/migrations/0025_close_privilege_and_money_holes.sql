-- Four holes an audit found in the policies. All of them are cases where the
-- application code was careful and the database was not, which is the only
-- kind that matters: the anon key is public and the session JWT belongs to the
-- caller, so PostgREST is the real surface. None is realised in data yet.

-- ---------------------------------------------------------------------------
-- 1. Any club member could make themselves a club admin.
--
-- invitations_insert had three branches, and the event branch never looked at
-- invited_role, which is a plain text column with no constraint. Any member
-- can create an event (events_insert only asks that they are a club member),
-- which makes them its organizer, and could then write an invitation carrying
-- both event_id and club_id with invited_role = 'admin' and auto_activate.
-- Signing up the invited address ran handle_new_user, which inserts
-- club_members at that role and activates the account past the waiting room.
--
-- createClubInvitation forces 'member' for non-admins and createInvitation
-- only sets auto_activate for app admins. Both were application-only.

alter table public.invitations
  drop constraint if exists invitations_invited_role_check;
alter table public.invitations
  add constraint invitations_invited_role_check
  check (invited_role in ('member', 'organizer', 'admin'));

drop policy if exists invitations_insert on public.invitations;
create policy invitations_insert on public.invitations
for insert with check (
  invited_by = auth.uid()
  -- skipping the queue is an app admin's call, never an inviter's
  and (auto_activate is not true or is_app_admin())
  and (
    is_app_admin()
    -- a club admin decides who joins their club, and at what role
    or (club_id is not null and is_club_admin(club_id))
    -- an organizer can bring people in, but only as members
    or (club_id is not null and is_club_manager(club_id) and invited_role = 'member')
    -- and inviting to an event you organize is inviting a member, nothing more
    or (event_id is not null and is_event_organizer(event_id) and invited_role = 'member')
  )
);

-- ---------------------------------------------------------------------------
-- 2 and 3. A settlement could be forged confirmed, or rewritten after the fact.
--
-- settlements_insert never mentioned `confirmed`, which is an ordinary
-- insertable column, so a debtor could post their own settlement with
-- confirmed = true and net their debt to zero. settlements_delete is gated on
-- `not confirmed`, so nobody could then remove it.
--
-- settlements_update had a USING clause and no WITH CHECK. Postgres reuses
-- USING, and RLS cannot restrict columns, so the recipient of a 100 cent
-- payment could rewrite it to a different payer for a different amount and it
-- still satisfied to_user = auth.uid().
--
-- RLS cannot see OLD, so the column rules live in a trigger.

drop policy if exists settlements_insert on public.settlements;
create policy settlements_insert on public.settlements
for insert with check (
  is_event_member(event_id)
  and (from_user = auth.uid() or is_event_organizer(event_id))
  -- a payment starts as a claim. Only the person receiving it can agree.
  and not confirmed
  -- paying yourself is not a thing, and it was the shape that made a proof
  -- readable: insert a settlement to yourself carrying someone else's
  -- proof_path and the storage policy handed you a signed URL
  and from_user <> to_user
);

create or replace function public.settlements_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  -- me is null for the service role, which is the notification pipeline and
  -- the cron, and they are trusted. Comparing against null yields null rather
  -- than true, so the null case is stated rather than relied on: the first
  -- version of this check passed silently for every caller without a session.
  if tg_op = 'INSERT' then
    -- a proof you did not upload is not yours to attach
    if me is not null
       and new.proof_path is not null
       and split_part(new.proof_path, '/', 1) <> me::text then
      raise exception 'ese comprobante no es tuyo';
    end if;
    return new;
  end if;

  if new.event_id is distinct from old.event_id
     or new.from_user is distinct from old.from_user
     or new.to_user is distinct from old.to_user
     or new.amount_cents is distinct from old.amount_cents
     or new.method is distinct from old.method
     or new.proof_path is distinct from old.proof_path then
    raise exception 'un pago se confirma o se rechaza, no se reescribe';
  end if;

  if new.confirmed and not old.confirmed and me is not null and me <> old.to_user then
    raise exception 'solo quien recibe el pago puede confirmarlo';
  end if;

  return new;
end $$;

drop trigger if exists settlements_guard on public.settlements;
create trigger settlements_guard
before insert or update on public.settlements
for each row execute function public.settlements_guard();

-- ---------------------------------------------------------------------------
-- 4. The last admin could walk out and lock the club.
--
-- Both paths were guarded in the UI only: DangerZone swaps the button when
-- isLastAdmin, and MemberRow hides the role picker on your own row. leaveClub
-- and updateMemberRole checked neither, and club_members_delete allows the
-- self branch unconditionally. After it, clubs_update, club_members INSERT,
-- event_categories, approve_change_request and approve_join_request all
-- require is_club_admin, so nothing about the club can ever change again.
create or replace function public.protect_last_club_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  leaving_admin boolean;
  others int;
begin
  leaving_admin := old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin');
  if not leaving_admin then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  -- A club being deleted takes its roster with it, and so does an account
  -- being removed. Neither is somebody walking out of a club that still
  -- exists. Cascading deletes fire triggers on the child table, so without
  -- this the guard would block deleteClub entirely.
  if not exists (select 1 from clubs where id = old.club_id) then
    return old;
  end if;
  if tg_op = 'DELETE' and not exists (select 1 from users where id = old.user_id) then
    return old;
  end if;

  select count(*) into others
    from club_members
   where club_id = old.club_id and role = 'admin' and user_id <> old.user_id;

  if others = 0 then
    raise exception 'un club siempre necesita al menos una persona con administración. Nombra a alguien más antes de salir.';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end $$;

drop trigger if exists protect_last_club_admin on public.club_members;
create trigger protect_last_club_admin
before update or delete on public.club_members
for each row execute function public.protect_last_club_admin();
