-- The roster count means two different things.
--
-- attendance_stats counts a member as present either because an organizer
-- recorded it or, for every event that finished before roll call had a UI,
-- because they said "voy" and nobody ever checked. Those are not the same
-- claim, and the difference matters to anyone reading the roster to judge who
-- actually turns up.
--
-- The design answers this with a "~" and a dotted underline on an inferred
-- count, and one plain sentence on tap. It is a footnote, not a warning: no
-- badge, no colour. That needs the split, so the view now carries it.
--
-- The two new columns go on the end: create or replace can append to a view
-- but cannot reorder it, and dropping this one would take the club page's
-- policy-checked read down with it.
create or replace view public.attendance_stats with (security_invoker = true) as
select e.club_id,
       r.user_id,
       e.category_id,
       count(*) as events_attended,
       max(coalesce(e.chosen_start, e.created_at)) as last_attended_at,
       count(*) filter (where e.attendance_taken_at is not null) as recorded_events,
       count(*) filter (where e.attendance_taken_at is null) as estimated_events
  from rsvps r
  join events e on e.id = r.event_id
 where e.status = 'done'::event_status
   and e.club_id is not null
   and case
         when e.attendance_taken_at is not null then r.attended is true
         else r.status = 'in'::rsvp_status
       end
 group by grouping sets ((e.club_id, r.user_id, e.category_id), (e.club_id, r.user_id));
