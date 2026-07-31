-- Who claimed it, from the caller's point of view.
--
-- The preview returned one `claimed` boolean, which conflates two very
-- different situations: you already used this link, and somebody else did.
-- The landing had to guess, so a member who reopened their own invitation was
-- asked "¿Te unes a Los Jueves?" when they had been in the club for a month.
--
-- auth.uid() is null for an anonymous caller, and claimed_by_user_id is never
-- null when claimed, so the comparison is false rather than accidentally true
-- for someone holding the token but not signed in.
--
-- Expiry is also reported only while the invitation is unclaimed. A window that
-- closed on a link somebody already used means nothing, and claim_invitation
-- agrees: it only refuses an expired invitation that nobody has claimed. Without
-- this the landing tells a member of a month's standing that their invitation
-- expired.
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
  claimed_by_me boolean,
  event_when timestamptz,
  event_where text,
  going int,
  capacity int,
  declined boolean,
  expired boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.name, c.slug, e.title, e.slug, i.email, i.phone,
         u.display_name,
         i.claimed_by_user_id is not null,
         i.claimed_by_user_id is not null and i.claimed_by_user_id = auth.uid(),
         -- an expired link stops describing the event: the whole point is that
         -- it is no longer a read channel on a private room
         case when x.dead then null else e.chosen_start end,
         case when x.dead then null else e.location end,
         case when x.dead then null else
           (select count(*)::int from rsvps r
             where r.event_id = e.id and r.status = 'in' and r.waitlist_pos is null) end,
         case when x.dead then null else e.capacity end,
         i.declined_at is not null,
         x.dead
  from invitations i
  cross join lateral (
    select i.claimed_by_user_id is null
       and i.expires_at is not null
       and i.expires_at < now() as dead
  ) x
  left join clubs c on c.id = i.club_id
  left join events e on e.id = i.event_id and e.deleted_at is null
  left join users u on u.id = i.invited_by
  where i.token = invite_token
$$;

revoke execute on function public.get_invitation_preview(text) from public;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;
