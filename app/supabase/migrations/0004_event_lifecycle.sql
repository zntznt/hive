-- 0004: event lifecycle (H6). Without a path to 'done', attendance_stats never
-- emits a row (it filters status='done'), defeating club history. 'cancelled'
-- needs to notify members. Both are organizer-only.

create or replace function set_event_status(eid uuid, new_status event_status) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if not is_event_organizer(eid) then raise exception 'organizer only'; end if;
  if new_status not in ('done','cancelled','scheduled') then
    raise exception 'use this only for done/cancelled/scheduled';
  end if;
  update events set status = new_status where id = eid;
  -- notify members only on cancellation (done is silent; scheduled is handled by pick_slot)
  if new_status = 'cancelled' then
    for m in select user_id from event_members where event_id = eid and user_id <> auth.uid()
    loop
      insert into notification_outbox (user_id, channel, template, payload)
      values (m.user_id,
              case when exists (select 1 from users u where u.id = m.user_id and u.phone_whatsapp is not null)
                   then 'whatsapp'::notif_channel else 'email' end,
              'event_cancelled', jsonb_build_object('event_id', eid));
    end loop;
  end if;
end $$;
