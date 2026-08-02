-- A club can be renamed.
--
-- Clubs get named once, in a modal, in the first thirty seconds of existing,
-- and then that name is on every screen for a year. "Los jueves" was a
-- placeholder for a group that now calls itself something else, and there was
-- no way to fix it short of deleting the club and losing its history.
--
-- Nothing else has to move. `clubs.slug` is a random twelve character string
-- (lib/slug.ts), not a slugified name, so a rename cannot break a link, a
-- bookmark or a calendar subscription. Every screen that shows a club's name
-- reads it live off `clubs`, so there is no copy to keep in step: the plate,
-- the search results and the notification variables all join to the row.
--
-- The only thing that needed changing here is the approval path. An admin
-- writes `clubs` directly, which `clubs_update` already allows. An organizer
-- proposes, and the proposal lands as a `change_requests` row of kind
-- 'about' alongside the description and the links, because they are one
-- subject edited in one modal: what this club is. So `approve_change_request`
-- applies the name in that same branch.
--
-- `coalesce(r.payload->>'name', name)` rather than a bare assignment, so a
-- proposal filed before this migration, whose payload has no name in it, keeps
-- the club's name instead of setting it to null. There is exactly one line of
-- difference from 0033; the rest is reproduced so this file is readable on its
-- own rather than as a diff against a migration nobody will open.

create or replace function public.approve_change_request(req_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; target_role club_role;
begin
  select * into r from change_requests where id = req_id;
  if r.id is null then raise exception 'not found'; end if;
  if not is_club_admin(r.club_id) then raise exception 'club admin only'; end if;
  if r.status <> 'pending' then raise exception 'already decided'; end if;

  if r.kind = 'about' then
    update clubs set
      name = coalesce(nullif(btrim(r.payload->>'name'), ''), name),
      description = r.payload->>'description',
      links = coalesce(r.payload->'links', links)
    where id = r.club_id;
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

-- `create or replace` keeps the existing ACL, so 0034's work survives this.
-- Restated anyway, because twice now a grant has been the thing that was
-- quietly wrong, and both times reading the code said it was fine.
revoke execute on function public.approve_change_request(uuid) from public, anon;
grant execute on function public.approve_change_request(uuid) to authenticated;

-- A name is what the club is called, so it may not be blank. Enforced here as
-- well as in the action, because the action is one of two callers and a
-- constraint is the only one that covers a proposal applied by the function
-- above. Sixty characters is the width the club card and the app bar were
-- drawn for; anything past it is truncated on every screen it appears on,
-- which is a worse way to find out.
alter table public.clubs
  add constraint clubs_name_not_blank check (btrim(name) <> '' and length(name) <= 60);
