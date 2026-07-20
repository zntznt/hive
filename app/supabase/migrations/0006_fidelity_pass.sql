-- 0006: schema needed to close design-fidelity gaps found after a closer
-- pass against the actual design-handoff JSX (club picture upload, revoking
-- an unclaimed invitation, and personal saved host locations).

alter table clubs add column avatar_url text;

-- invitations had select/insert but no delete policy - needed for "revoke".
create policy invitations_delete on invitations for delete using (
  (event_id is not null and is_event_organizer(event_id))
  or (club_id is not null and is_club_admin(club_id))
  or is_app_admin()
);

-- personal saved places ("Places you can host" on Account, feeds
-- LocationPicker's "your places" suggestions across every club).
create table saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  addr text,
  query text not null,
  created_at timestamptz not null default now()
);
alter table saved_places enable row level security;
create policy saved_places_all on saved_places for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- event_members had no update policy - needed to upsert-promote an existing
-- member to co-organizer (addCoOrganizer) instead of only ever inserting.
create policy event_members_update on event_members for update
  using (is_event_organizer(event_id)) with check (is_event_organizer(event_id));

-- organizers can now also propose a club picture, not just a banner.
alter table change_requests drop constraint change_requests_kind_check;
alter table change_requests add constraint change_requests_kind_check
  check (kind in ('about', 'category_add', 'category_edit', 'category_delete', 'banner', 'avatar', 'member_removal'));
