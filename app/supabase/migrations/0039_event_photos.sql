-- The album.
--
-- An event ends and the pictures go to the group chat, which is the one place
-- the app was built to replace. Everything else about the evening already
-- lives here: who came, what it cost, who brought the ice.
--
-- A row per photo rather than listing the bucket, because listing storage
-- cannot answer "who added this" or be filtered by RLS the way the rest of the
-- app is, and both of those decide what the grid may show and who may remove
-- what.
create table if not exists public.event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  uploaded_by uuid not null references public.users(id),
  -- the storage path, not a URL: the public URL is derived where it is
  -- rendered, so moving buckets later does not rewrite every row
  path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists event_photos_event_idx on public.event_photos (event_id, created_at desc);

alter table public.event_photos enable row level security;

-- Same visibility as the event itself. can_see_event is what every other read
-- on an event is already gated by, so the album cannot be more visible than
-- the thing it belongs to.
drop policy if exists event_photos_select on public.event_photos;
create policy event_photos_select on public.event_photos
for select to authenticated
using (can_see_event(event_id));

-- Adding is for people who were actually there, in the sense the app uses
-- everywhere else: an active member of the event.
drop policy if exists event_photos_insert on public.event_photos;
create policy event_photos_insert on public.event_photos
for insert to authenticated
with check (is_event_member(event_id) and uploaded_by = auth.uid());

-- Your own, or anything if you run the event. An organizer needs to be able to
-- take down a photo somebody else should not have posted.
drop policy if exists event_photos_delete on public.event_photos;
create policy event_photos_delete on public.event_photos
for delete to authenticated
using (uploaded_by = auth.uid() or is_event_organizer(event_id));

-- The bucket, with the limits 0032 established for every other bucket rather
-- than a fresh set of its own.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-photos', 'event-photos', true, 2 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
   set public = true,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- Objects live under <event_id>/<uploader_id>/, so both halves of the delete
-- rule above can be enforced on storage too without a lookup.
drop policy if exists event_photos_object_insert on storage.objects;
create policy event_photos_object_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'event-photos'
  and (storage.foldername(name))[2] = auth.uid()::text
  and is_event_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists event_photos_object_select on storage.objects;
create policy event_photos_object_select on storage.objects
for select to authenticated
using (bucket_id = 'event-photos' and can_see_event(((storage.foldername(name))[1])::uuid));

drop policy if exists event_photos_object_delete on storage.objects;
create policy event_photos_object_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'event-photos'
  and ((storage.foldername(name))[2] = auth.uid()::text
       or is_event_organizer(((storage.foldername(name))[1])::uuid))
);
