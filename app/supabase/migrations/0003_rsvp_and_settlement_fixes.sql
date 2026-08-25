-- 0003: fix waitlist promotion (H3) and allow retracting unconfirmed settlements (H5).

-- H5: payer may delete their own not-yet-confirmed settlement (the "retirar" undo).
create policy settlements_delete on settlements for delete
  using (from_user = auth.uid() and not confirmed);

-- H3: rewrite rsvp_set. Old version promoted a waitlist head on EVERY 'out' call
-- (even from a waitlisted/maybe/already-out member), causing unbounded overbooking,
-- false promotions, and self-demotion on re-tapping 'Voy'.
-- New model: capacity is enforced by a single count-based reconcile that runs after
-- any state change and self-heals from an overbooked state.
create or replace function promote_waitlist(eid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ev record; seated int; nxt record;
begin
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

create or replace function rsvp_set(eid uuid, st rsvp_status) returns void
language plpgsql security definer set search_path = public as $$
declare ev record; seated int; pos int;
begin
  if not is_active_user() or not is_event_member(eid) then raise exception 'not an event member'; end if;
  select capacity, waitlist_enabled into ev from events where id = eid;
  perform pg_advisory_xact_lock(hashtext(eid::text));

  if st = 'in' and ev.capacity is not null then
    -- count confirmed seats held by everyone EXCEPT me (I may already hold one)
    select count(*) into seated from rsvps
      where event_id = eid and status = 'in' and waitlist_pos is null and user_id <> auth.uid();
    if seated >= ev.capacity then
      if not ev.waitlist_enabled then raise exception 'event is full'; end if;
      -- go to the waitlist, but keep my existing position if I already had one
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

  -- a seat may have freed (left, or went maybe/out from a confirmed seat), reconcile
  perform promote_waitlist(eid);
end $$;
