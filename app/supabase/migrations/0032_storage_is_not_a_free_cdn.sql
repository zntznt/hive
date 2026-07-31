-- Three buckets with no limits on them, and two columns that took any URL.
--
-- None of the buckets set file_size_limit or allowed_mime_types, and the
-- upload path passed the browser's own file.type straight through as
-- contentType. So any signed-in account could store arbitrary bytes of any
-- size under any content type, on a public bucket served from our domain:
-- a file host, and a way to serve text/html from an origin members trust.
--
-- Separately, avatar_photo_url and banner_url were plain text columns written
-- by an ordinary UPDATE. Uploading through the app was never the only way to
-- fill them: PostgREST accepts the write directly, so either column could be
-- pointed at any address on the internet. A banner is rendered to every member
-- of a club, which turns "someone else's server" into a per member request log
-- with an IP and a user agent, and into an image that can change after anyone
-- looked at it.

-- 2 MB is well above what ImageCropModal produces (a square JPEG at canvas
-- quality, tens of KB) and well below anything worth hosting here.
update storage.buckets
   set file_size_limit = 2 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id in ('avatars', 'banners', 'payment-proofs');

-- payment-proofs had INSERT and SELECT and nothing else, so an object could
-- never be replaced or removed: not by the person who uploaded it, and not
-- when the settlement it belonged to was rejected or retracted. Every screenshot
-- of a bank transfer ever uploaded stayed forever, and a proof attached to a
-- mistaken claim could not be taken back.
--
-- Both are scoped to the uploader's own folder, the same rule the INSERT
-- policy uses. Note that the recipient can read a proof (payment_proofs_select)
-- but not delete one: the evidence for a payment they are being asked to
-- confirm is not theirs to remove.
drop policy if exists payment_proofs_update on storage.objects;
create policy payment_proofs_update on storage.objects
for update to authenticated
using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists payment_proofs_delete on storage.objects;
create policy payment_proofs_delete on storage.objects
for delete to authenticated
using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

-- The two URL columns may only ever name an object in our own storage, in the
-- bucket that belongs to them. Written as a constraint rather than a check in
-- the server action because the server action is not the only writer.
alter table public.users drop constraint if exists users_avatar_photo_url_is_ours;
alter table public.users add constraint users_avatar_photo_url_is_ours
  check (avatar_photo_url is null or
         avatar_photo_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/[A-Za-z0-9/._-]+$');

alter table public.clubs drop constraint if exists clubs_banner_url_is_ours;
alter table public.clubs add constraint clubs_banner_url_is_ours
  check (banner_url is null or
         banner_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/banners/[A-Za-z0-9/._-]+$');
