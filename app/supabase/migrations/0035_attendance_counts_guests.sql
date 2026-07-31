-- Roll call, finished.
--
-- mark_attendance has existed since 0012 and nothing has ever called it: there
-- is no UI. rsvps.attended, events.attendance_taken_at and the attendance_stats
-- view all hang off it, so every club roster row reads "sin asistencias
-- todavía" about a number that no screen could ever produce.
--
-- The design counts guests too. A guest is a person in the room, so they count
-- towards the event, and they are nobody's account, so they never touch a
-- member's own record. attendance_stats groups by rsvps.user_id, so that
-- separation is already true by construction; the guest just needs somewhere
-- to be recorded.
alter table public.guests add column if not exists attended boolean;

-- Replaced rather than overloaded. Two arities of the same name is a trap the
-- next caller falls into, and this one has no callers to break.
drop function if exists public.mark_attendance(uuid, uuid[]);

create or replace function public.mark_attendance(eid uuid, present uuid[], present_guests uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_event_organizer(eid) then
    raise exception 'solo la organización del evento puede pasar lista';
  end if;

  update public.rsvps
     set attended = (user_id = any(coalesce(present, '{}')))
   where event_id = eid;

  -- a promoted guest became a member and answers for themselves in rsvps
  update public.guests
     set attended = (id = any(coalesce(present_guests, '{}')))
   where event_id = eid and promoted_to_user_id is null;

  update public.events
     set attendance_taken_at = now()
   where id = eid;
end;
$$;

revoke all on function public.mark_attendance(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.mark_attendance(uuid, uuid[], uuid[]) to authenticated;
