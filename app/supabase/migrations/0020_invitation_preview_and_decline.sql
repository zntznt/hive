-- What you are saying yes to, and a way to say no.
--
-- The invite landing asked for an email address before telling you anything
-- beyond a club name: the only button on the screen was "Aceptar invitación",
-- so the one honest answer to "I don't think I can make it" was to close the
-- tab. That leaves the organizer counting a silence as an unopened invite
-- forever.
--
-- Two changes. The preview carries the facts a person actually decides on
-- (when, where, how many are going, whether the room is full), and an
-- invitation can be declined without an account, because requiring someone to
-- sign up in order to say no is a way of not letting them.

-- The bin columns, pulled forward from 0021.
--
-- The preview below filters on events.deleted_at, and 0021 is the migration
-- that creates it: that file says so itself, it was written after the fact to
-- recover a change applied straight to production. So when this was written
-- the column was already there on the live database, and the recorded history
-- has the two the wrong way round. It only shows up on a database built from
-- these files, which is to say it showed up the first time anybody tried.
-- Guarded, so it is a no-op wherever the column already exists, including
-- 0021 itself.
alter table public.events
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.users(id);

alter table public.invitations
  add column if not exists declined_at timestamptz;

-- Return type changes, so a plain create-or-replace is refused by Postgres.
drop function if exists public.get_invitation_preview(text);

create function public.get_invitation_preview(invite_token text)
returns table (
  club_name text,
  club_slug text,
  event_title text,
  event_slug text,
  email citext,
  phone text,
  inviter text,
  claimed boolean,
  event_when timestamptz,
  event_where text,
  going int,
  capacity int,
  declined boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.name, c.slug, e.title, e.slug, i.email, i.phone,
         u.display_name, i.claimed_by_user_id is not null,
         e.chosen_start, e.location,
         -- confirmed only: someone sitting on the waitlist is not a person
         -- you would meet there, so counting them would oversell the room
         (select count(*)::int from rsvps r
           where r.event_id = e.id and r.status = 'in' and r.waitlist_pos is null),
         e.capacity,
         i.declined_at is not null
  from invitations i
  left join clubs c on c.id = i.club_id
  left join events e on e.id = i.event_id and e.deleted_at is null
  left join users u on u.id = i.invited_by
  where i.token = invite_token
$$;

-- Declining is a bearer action, like claiming: holding the token is the proof.
-- Only ever sets the flag on an unclaimed invitation, and clearing it is the
-- same call from the other direction, so "actually, I can go" is one tap and
-- not a request for a new invite.
create or replace function public.decline_invitation(invite_token text, undo boolean default false)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  hit int;
begin
  update invitations
     set declined_at = case when undo then null else now() end
   where token = invite_token
     and claimed_by_user_id is null;
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

grant execute on function public.decline_invitation(text, boolean) to anon, authenticated;
