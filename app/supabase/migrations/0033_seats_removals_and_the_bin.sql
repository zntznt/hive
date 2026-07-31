-- Three promises the app made and did not keep.

-- 1. Guests took no seat.
--
-- rsvp_set counted capacity as "rsvps with status 'in' and no waitlist
-- position" and stopped there, while guests live in their own table. So an
-- event with ten seats and six members bringing one guest each was twelve
-- people, and both the waitlist and the "van 6 de 10" line read six. The
-- waitlist is the part that matters: it exists to stop exactly this, and it
-- never fired, so the eleventh and twelfth person walked in past a cap that
-- said there was room.
--
-- A guest only occupies a seat while the member who brought them is seated.
-- That way an unanswered or withdrawn RSVP does not leave phantom people
-- holding places, and nobody's guest list has to be deleted to free a seat.
create or replace function public.event_seats_taken(eid uuid, excluding uuid default null)
returns int
language sql stable security definer set search_path = public
as $$
  select (
    select count(*) from rsvps r
     where r.event_id = eid and r.status = 'in' and r.waitlist_pos is null
       and (excluding is null or r.user_id <> excluding)
  ) + (
    select count(*) from guests g
      join rsvps r on r.event_id = g.event_id and r.user_id = g.host_user_id
     where g.event_id = eid and g.promoted_to_user_id is null
       and r.status = 'in' and r.waitlist_pos is null
       and (excluding is null or g.host_user_id <> excluding)
  )
$$;

create or replace function public.rsvp_set(eid uuid, st rsvp_status)
returns void
language plpgsql security definer set search_path = public
as $$
declare ev record; taken int; need int; pos int;
begin
  if not is_active_user() or not is_event_member(eid) then raise exception 'not an event member'; end if;
  select capacity, waitlist_enabled into ev from events where id = eid;
  perform pg_advisory_xact_lock(hashtext(eid::text));

  if st = 'in' and ev.capacity is not null then
    -- what everyone else is holding, and what this member needs: themselves
    -- plus whoever they are bringing. Someone arriving with two guests and one
    -- seat left goes on the waitlist as a group rather than seating themselves
    -- and pushing the event over its own cap.
    taken := event_seats_taken(eid, auth.uid());
    select 1 + count(*) into need from guests
     where event_id = eid and host_user_id = auth.uid() and promoted_to_user_id is null;

    if taken + need > ev.capacity then
      if not ev.waitlist_enabled then raise exception 'event is full'; end if;
      select waitlist_pos into pos from rsvps where event_id = eid and user_id = auth.uid();
      if pos is null then
        select coalesce(max(waitlist_pos), 0) + 1 into pos from rsvps where event_id = eid;
      end if;
      insert into rsvps (event_id, user_id, status, waitlist_pos)
      values (eid, auth.uid(), 'in', pos)
      on conflict (event_id, user_id) do update set status = 'in', waitlist_pos = pos;
      return;
    end if;
  end if;

  insert into rsvps (event_id, user_id, status, waitlist_pos)
  values (eid, auth.uid(), st, null)
  on conflict (event_id, user_id) do update set status = excluded.status, waitlist_pos = null;

  perform promote_waitlist(eid);
end $$;

-- promote_waitlist seated people by counting rsvps alone, for the same reason
-- and with the same result: it would seat someone into a place a guest already
-- occupies. It also has to check that the person it is about to seat actually
-- fits with their own guests, or promotion is another way past the cap.
create or replace function public.promote_waitlist(eid uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare ev record; taken int; need int; nxt record;
begin
  if auth.uid() is not null and not can_see_event(eid) then
    raise exception 'not your event';
  end if;
  select capacity, waitlist_enabled into ev from events where id = eid;
  if ev.capacity is null or not ev.waitlist_enabled then return; end if;
  loop
    taken := event_seats_taken(eid);
    exit when taken >= ev.capacity;
    select user_id, waitlist_pos into nxt from rsvps
      where event_id = eid and status = 'in' and waitlist_pos is not null
      order by waitlist_pos limit 1;
    exit when nxt.user_id is null;

    select 1 + count(*) into need from guests
     where event_id = eid and host_user_id = nxt.user_id and promoted_to_user_id is null;
    -- the person at the front does not fit with their guests. Stopping rather
    -- than skipping keeps the queue a queue: skipping would quietly seat
    -- whoever arrived later and travels lighter.
    exit when taken + need > ev.capacity;

    update rsvps set waitlist_pos = null where event_id = eid and user_id = nxt.user_id;
    insert into notification_outbox (user_id, channel, template, payload)
    values (nxt.user_id, 'email', 'waitlist_promoted', jsonb_build_object('event_id', eid));
  end loop;
end $$;

-- And the other direction: adding a guest was a plain insert with no idea that
-- capacity existed, so "+1" was an unlimited door next to a locked one.
create or replace function public.guests_fit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare cap int; taken int;
begin
  select capacity into cap from events where id = new.event_id;
  if cap is null then return new; end if;
  -- only counts once the host is actually seated, matching event_seats_taken.
  -- A guest added before the host answers is checked when they RSVP.
  if not exists (select 1 from rsvps
                  where event_id = new.event_id and user_id = new.host_user_id
                    and status = 'in' and waitlist_pos is null) then
    return new;
  end if;
  taken := event_seats_taken(new.event_id);
  if taken >= cap then
    raise exception 'ya no hay lugar en este evento';
  end if;
  return new;
end $$;

drop trigger if exists guests_fit_trg on public.guests;
create trigger guests_fit_trg
before insert on public.guests
for each row execute function public.guests_fit();

-- 2. A removal request that did not say who.
--
-- approve_change_request read the target straight out of the payload and
-- deleted that club_members row. The approvals screen showed "Quitar miembro"
-- and the proposer's name and nothing else, because the payload holds only a
-- uuid, so an admin approved a removal without being told who was being
-- removed. And nothing checked the target's role, so an organizer could file a
-- request to remove a club admin (or the last one) and any admin could wave it
-- through in one tap while reading a label that named nobody.
--
-- Removals through this path are now limited to plain members. Removing an
-- organizer or an admin stays with the admins, who do it directly and can see
-- exactly who they picked.
create or replace function public.approve_change_request(req_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare r record; target_role club_role;
begin
  select * into r from change_requests where id = req_id;
  if r.id is null then raise exception 'not found'; end if;
  if not is_club_admin(r.club_id) then raise exception 'club admin only'; end if;
  if r.status <> 'pending' then raise exception 'already decided'; end if;

  if r.kind = 'about' then
    update clubs set description = r.payload->>'description', links = coalesce(r.payload->'links', links) where id = r.club_id;
  elsif r.kind = 'category_add' then
    insert into event_categories (club_id, name, emoji) values (r.club_id, r.payload->>'name', r.payload->>'emoji');
  elsif r.kind = 'category_edit' then
    update event_categories set name = coalesce(r.payload->>'name', name), emoji = r.payload->>'emoji'
      where id = (r.payload->>'category_id')::uuid and club_id = r.club_id;
  elsif r.kind = 'category_delete' then
    delete from event_categories where id = (r.payload->>'category_id')::uuid and club_id = r.club_id;
  elsif r.kind = 'banner' then
    update clubs set banner_url = r.payload->>'banner_url' where id = r.club_id;
  elsif r.kind = 'avatar' then
    update clubs set avatar_url = r.payload->>'avatar_url' where id = r.club_id;
  elsif r.kind = 'event_delete' then
    update events set deleted_at = now(), deleted_by = r.requested_by
      where id = (r.payload->>'event_id')::uuid and club_id = r.club_id;
  elsif r.kind = 'event_restore' then
    update events set deleted_at = null, deleted_by = null
      where id = (r.payload->>'event_id')::uuid and club_id = r.club_id;
  elsif r.kind = 'member_removal' then
    select role into target_role from club_members
     where club_id = r.club_id and user_id = (r.payload->>'user_id')::uuid;
    if target_role is null then raise exception 'esa persona ya no está en el club'; end if;
    if target_role <> 'member' then
      raise exception 'quien organiza o administra no se quita por propuesta, hazlo desde el club';
    end if;
    delete from club_members where club_id = r.club_id and user_id = (r.payload->>'user_id')::uuid;
  else
    raise exception 'unknown change_request kind %', r.kind;
  end if;

  update change_requests set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = req_id;
end $$;

-- 3. "Se borra solo a los 30 días."
--
-- Nothing ever borrowed it. Deleted events sat in the bin forever, which is
-- the kind of promise that only shows up as a surprise a year later when an
-- event everybody thought was gone turns up in a query. The daily job calls
-- this; the row and everything hanging off it goes by cascade.
create or replace function public.purge_deleted_events(older_than_days int default 30)
returns int
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  with gone as (
    delete from events
     where deleted_at is not null
       and deleted_at < now() - make_interval(days => older_than_days)
    returning 1
  )
  select count(*) into n from gone;
  return n;
end $$;

revoke execute on function public.purge_deleted_events(int) from public, anon, authenticated;
revoke execute on function public.event_seats_taken(uuid, uuid) from anon;

-- clubs.avatar_url was missed in 0032: same free-for-all text column, same
-- rendering to every member. It is uploaded into the banners bucket.
alter table public.clubs drop constraint if exists clubs_avatar_url_is_ours;
alter table public.clubs add constraint clubs_avatar_url_is_ours
  check (avatar_url is null or
         avatar_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/banners/[A-Za-z0-9/._-]+$');
