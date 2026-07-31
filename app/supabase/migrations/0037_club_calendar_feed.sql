-- A club's schedule, in the calendar people already check.
--
-- The per-event .ics (0021) is a download: it puts one evening on your phone
-- and knows nothing afterwards. A subscription is the other half. The calendar
-- app re-fetches on its own schedule, so a new event appears, a moved time
-- moves, and a cancellation shows as cancelled, without anybody being sent
-- anything.
--
-- The URL is the credential. A calendar app has no session, so anyone holding
-- the link reads the schedule, which is exactly why it is a long random token
-- and not the slug, and why an admin can rotate it. Same shape as the
-- invitation and club-join tokens the app already hands out.
alter table public.clubs
  add column if not exists calendar_token text unique;

update public.clubs
   set calendar_token = encode(gen_random_bytes(32), 'hex')
 where calendar_token is null;

alter table public.clubs
  alter column calendar_token set default encode(gen_random_bytes(32), 'hex'),
  alter column calendar_token set not null;

-- The feed itself. SECURITY DEFINER and keyed by the token, because the caller
-- is a calendar app with no session: the token is the whole authorization, so
-- it is matched exactly and nothing else about the club is exposed.
--
-- Only events worth putting in a calendar: a real time is set, the event is
-- not in the bin, and it is not still looking for a date.
create or replace function public.get_club_calendar(cal_token text)
returns table (
  club_name text,
  event_id uuid,
  slug text,
  title text,
  location text,
  chosen_start timestamptz,
  chosen_end timestamptz,
  status event_status
)
language sql
stable
security definer
set search_path = public
as $$
  select c.name, e.id, e.slug, e.title, e.location, e.chosen_start, e.chosen_end, e.status
    from clubs c
    join events e on e.club_id = c.id
   where c.calendar_token = cal_token
     and length(cal_token) >= 32
     and e.deleted_at is null
     and e.chosen_start is not null
     and e.status in ('scheduled', 'done', 'cancelled')
   order by e.chosen_start
$$;

revoke all on function public.get_club_calendar(text) from public;
grant execute on function public.get_club_calendar(text) to anon, authenticated;

-- Rotating it is an admin act, and it breaks every existing subscription, so
-- it says so where it is offered rather than here.
create or replace function public.rotate_club_calendar_token(cid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare fresh text;
begin
  if not is_club_admin(cid) then
    raise exception 'solo la administración del club puede cambiar el enlace';
  end if;
  fresh := encode(gen_random_bytes(32), 'hex');
  update clubs set calendar_token = fresh where id = cid;
  return fresh;
end;
$$;

revoke all on function public.rotate_club_calendar_token(uuid) from public, anon;
grant execute on function public.rotate_club_calendar_token(uuid) to authenticated;
