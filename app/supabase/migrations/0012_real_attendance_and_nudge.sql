-- 0012: two things the club memory was missing.
--
-- 1. Attendance measured attention, not attendance. attendance_stats counted
--    rsvps.status = 'in' on done events, so someone who says "voy" to
--    everything and never arrives read identically to the member who always
--    shows up. The club roster is supposed to answer "when did Lucía last
--    come to a games night", and it was answering "when did she last intend
--    to". Organizers can now record who actually came.
--
-- 2. Nothing chased the people who never answered. Every notification so far
--    fires at members who already engaged, which leaves the one message a
--    real organizer actually sends ("faltan 4 por confirmar") to be typed by
--    hand in the WhatsApp group.

-- null means nobody recorded it, which is different from "did not come"
alter table public.rsvps
  add column if not exists attended boolean;

-- set once the organizer takes attendance, so the stats view knows whether to
-- trust `attended` or fall back to the old RSVP-based reading
alter table public.events
  add column if not exists attendance_taken_at timestamptz;

-- rsvps_write is scoped to user_id = auth.uid(), correct for answering for
-- yourself and wrong for taking attendance. Widening it to organizers would
-- also let them rewrite people's answers, so this writes the one column and
-- nothing else.
create or replace function public.mark_attendance(eid uuid, present uuid[])
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
     set attended = (user_id = any(present))
   where event_id = eid;

  update public.events
     set attendance_taken_at = now()
   where id = eid;
end;
$$;

revoke all on function public.mark_attendance(uuid, uuid[]) from public;
grant execute on function public.mark_attendance(uuid, uuid[]) to authenticated;

-- Counts real attendance where it was recorded, and keeps reading RSVPs for
-- every event that closed before this existed, so no history is lost.
create or replace view public.attendance_stats with (security_invoker = true) as
select e.club_id,
       r.user_id,
       e.category_id,
       count(*) as events_attended,
       max(coalesce(e.chosen_start, e.created_at)) as last_attended_at
  from rsvps r
  join events e on e.id = r.event_id
 where e.status = 'done'
   and e.club_id is not null
   and case
         when e.attendance_taken_at is not null then r.attended is true
         else r.status = 'in'
       end
 group by grouping sets ((e.club_id, r.user_id, e.category_id), (e.club_id, r.user_id));

-- The chase message. Body rules are the ones Meta already enforced on the
-- other templates: no placeholder at the very start or end.
insert into public.notification_templates (channel, key, subject, body, wa_language, wa_vars)
values
  ('email', 'rsvp_pending', 'Falta tu respuesta para {{event}}',
   E'Hola {{name}},\n\nTodavía no nos dices si vas a "{{event}}", el {{when}}.\n\nSaberlo ayuda a organizar el lugar y lo que hay que llevar. Responde aquí: {{link}}\n\nGracias.',
   'es_MX', array[]::text[]),
  ('whatsapp', 'rsvp_pending', null,
   'Hola {{name}}, todavía no dices si vas a "{{event}}", el {{when}}. Saberlo ayuda a organizar el lugar y lo que hay que llevar. Responde aquí: {{link}} ¡Gracias!',
   'es_MX', array['name', 'event', 'when', 'link'])
on conflict (channel, key) do nothing;
