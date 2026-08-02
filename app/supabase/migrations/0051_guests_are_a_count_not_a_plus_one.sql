-- People bring a partner and two friends. "+1" was never the real shape.
--
-- The form asked a yes/no question and the rest of the stack already knew
-- better: the seat maths counts guests per host, the roster chips list them
-- individually, and event_seats_taken sums them. A boolean was the only thing
-- in the pile that thought the answer was one or none, and the offer row above
-- it promised "una pareja, un par de amigos" in the same breath.
--
-- Null means guests are not allowed at all, which is what allow_guests = false
-- meant. Existing events that allowed them get 1: it is what they actually
-- permitted, and inventing a larger number would quietly widen every guest
-- list already agreed to.
--
-- The ceiling of 5 is the design's. Beyond that it stops being "bring
-- somebody" and becomes a second invitation list, which is a different feature
-- and belongs to the club, not the event.

alter table public.events
  add column if not exists max_guests_per_member int
  check (max_guests_per_member is null or max_guests_per_member between 1 and 5);

update public.events
  set max_guests_per_member = 1
  where allow_guests and max_guests_per_member is null;

-- The trigger now enforces the per-member ceiling as well as capacity. Without
-- this the number would be a suggestion: the form would offer "cada miembro
-- puede traer 2" and the insert would happily take a fourth.
create or replace function public.guests_fit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare cap int; taken int; per_member int; mine int;
begin
  select capacity, max_guests_per_member into cap, per_member from events where id = new.event_id;

  if per_member is not null then
    select count(*) into mine from guests
      where event_id = new.event_id and host_user_id = new.host_user_id
        and promoted_to_user_id is null;
    if mine >= per_member then
      raise exception 'ya llegaste a tu límite de invitados en este evento';
    end if;
  end if;

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

comment on column public.events.max_guests_per_member is
  'How many people each member may bring, 1 to 5. Null means none. "+1" was never the real shape: people bring a partner and two friends.';
