-- 0005: schema for the design-system alignment pass. Adds: member avatars +
-- notification prefs, club about/banner/public-join, the organizer club role,
-- the change-request approval queue (about/category/banner/member-removal),
-- club join requests (guest -> member), payment methods + a fully-featured
-- settle-up flow (method, proof screenshot, recipient reject), and the
-- notification template CMS + its outbox wiring.

-- ── users: avatar + notification prefs ──────────────────────────────────────
alter table users add column avatar_kind text not null default 'bug' check (avatar_kind in ('bug', 'photo'));
alter table users add column avatar_bug text not null default 'bug'
  check (avatar_bug in ('bug', 'spider', 'mosquito', 'locust', 'worm'));
alter table users add column avatar_photo_url text;
alter table users add column notif_email boolean not null default true;
alter table users add column notif_whatsapp boolean not null default false;
-- avatar_color already exists (0001); it doubles as the bug tile color.

-- ── clubs: about, banner, public join link ──────────────────────────────────
alter table clubs add column description text;
alter table clubs add column banner_url text;
alter table clubs add column links jsonb not null default '[]';
create type club_join_mode as enum ('invite_only', 'anyone_with_link');
alter table clubs add column join_mode club_join_mode not null default 'invite_only';
alter table clubs add column join_token text unique not null
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
create policy clubs_delete on clubs for delete using (is_club_admin(id));

-- clubs are publicly previewable by join_token (pre-auth), mirroring
-- get_invitation_preview's shape for invitations.
create or replace function get_club_join_preview(jtoken text)
returns table (club_name text, club_slug text, join_mode club_join_mode)
language sql stable security definer set search_path = public as $$
  select name, slug, join_mode from clubs where join_token = jtoken
$$;

-- club_members had no update policy at all (0001 only wired insert/select/delete);
-- admins need one to promote/demote member <-> organizer <-> admin.
create policy club_members_update on club_members for update
  using (is_club_admin(club_id)) with check (is_club_admin(club_id));

-- ── club_role: add the organizer tier (invite/create-event rights short of admin) ──
alter type club_role add value 'organizer';

-- a club "manager" is an admin or organizer of that club (or the app admin);
-- mirrors is_club_admin's shape but includes organizers, for the approvals
-- queue's visibility (organizers see pending items, only admins decide them).
create or replace function is_club_manager(cid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select is_app_admin() or exists
   (select 1 from club_members where club_id = cid and user_id = auth.uid() and role in ('admin', 'organizer')) $$;

-- ── club join requests (guest requests to join via the public link) ────────
create table club_join_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_by uuid references users(id),
  decided_at timestamptz
);
create unique index club_join_requests_pending_uniq on club_join_requests (club_id, user_id) where status = 'pending';
alter table club_join_requests enable row level security;

create policy club_join_requests_select on club_join_requests for select
  using (user_id = auth.uid() or is_club_manager(club_id));
-- must also re-check join_mode here (not just in request_join_club's RPC body)
-- since RLS, not the RPC, is this app's actual enforcement boundary - a raw
-- client insert must not be able to file a request against an invite_only club.
create policy club_join_requests_insert on club_join_requests for insert
  with check (
    is_active_user() and user_id = auth.uid() and not is_club_member(club_id)
    and exists (select 1 from clubs c where c.id = club_id and c.join_mode = 'anyone_with_link')
  );
-- direct client updates may only decline; approving must go through the RPC
-- below so the membership insert and the status flip stay atomic.
create policy club_join_requests_decline on club_join_requests for update
  using (is_club_admin(club_id)) with check (status = 'declined');

create or replace function approve_join_request(req_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from club_join_requests where id = req_id;
  if r.id is null then raise exception 'not found'; end if;
  if not is_club_admin(r.club_id) then raise exception 'club admin only'; end if;
  if r.status <> 'pending' then raise exception 'already decided'; end if;
  insert into club_members (club_id, user_id, role) values (r.club_id, r.user_id, 'member')
    on conflict do nothing;
  update club_join_requests set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = req_id;
end $$;

-- signed-in request-to-join: token possession lets you file a request (not a membership)
create or replace function request_join_club(jtoken text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; mode club_join_mode; req_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select id, join_mode into cid, mode from clubs where join_token = jtoken;
  if cid is null then raise exception 'invitation not found'; end if;
  if mode <> 'anyone_with_link' then raise exception 'this club is not open for join requests'; end if;
  if is_club_member(cid) then raise exception 'already a member'; end if;
  insert into club_join_requests (club_id, user_id) values (cid, auth.uid())
    on conflict (club_id, user_id) where status = 'pending' do nothing
    returning id into req_id;
  return req_id;
end $$;

-- ── change requests: organizer-proposed edits an admin approves/declines ───
create table change_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  kind text not null check (kind in ('about', 'category_add', 'category_edit', 'category_delete', 'banner', 'member_removal')),
  payload jsonb not null default '{}',
  requested_by uuid not null references users(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table change_requests enable row level security;

create policy change_requests_select on change_requests for select using (is_club_manager(club_id));
create policy change_requests_insert on change_requests for insert
  with check (is_club_manager(club_id) and requested_by = auth.uid());
create policy change_requests_decline on change_requests for update
  using (is_club_admin(club_id)) with check (status = 'declined');

create or replace function approve_change_request(req_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from change_requests where id = req_id;
  if r.id is null then raise exception 'not found'; end if;
  if not is_club_admin(r.club_id) then raise exception 'club admin only'; end if;
  if r.status <> 'pending' then raise exception 'already decided'; end if;

  if r.kind = 'about' then
    update clubs set description = r.payload->>'description' where id = r.club_id;
  elsif r.kind = 'category_add' then
    insert into event_categories (club_id, name, emoji) values (r.club_id, r.payload->>'name', r.payload->>'emoji');
  elsif r.kind = 'category_edit' then
    update event_categories set name = coalesce(r.payload->>'name', name), emoji = r.payload->>'emoji'
      where id = (r.payload->>'category_id')::uuid and club_id = r.club_id;
  elsif r.kind = 'category_delete' then
    delete from event_categories where id = (r.payload->>'category_id')::uuid and club_id = r.club_id;
  elsif r.kind = 'banner' then
    update clubs set banner_url = r.payload->>'banner_url' where id = r.club_id;
  elsif r.kind = 'member_removal' then
    delete from club_members where club_id = r.club_id and user_id = (r.payload->>'user_id')::uuid;
  else
    raise exception 'unknown change_request kind %', r.kind;
  end if;

  update change_requests set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = req_id;
end $$;

-- ── account deletion (self-service, anonymize + disable, no auth.users delete) ──
create or replace function request_account_deletion() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  perform set_config('hive.bypass_privilege_guard', 'on', true);
  update users set display_name = 'Cuenta eliminada', avatar_photo_url = null, avatar_kind = 'bug', status = 'disabled'
  where id = auth.uid();
  perform set_config('hive.bypass_privilege_guard', '', true);
end $$;

-- ── app admin grant/revoke (caller already being admin satisfies the
-- privilege-change trigger, same as admin_set_user_status) ─────────────────
create or replace function admin_set_app_admin(target uuid, make_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_app_admin() then raise exception 'app admin only'; end if;
  update users set is_app_admin = make_admin where id = target;
end $$;

-- ── payment methods ("how do I get paid back") ──────────────────────────────
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('bank_account', 'bank_code', 'card', 'cash', 'other')),
  value text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table payment_methods enable row level security;

create policy payment_methods_select on payment_methods for select using (
  user_id = auth.uid()
  or exists (select 1 from club_members a join club_members b on a.club_id = b.club_id
             where a.user_id = payment_methods.user_id and b.user_id = auth.uid())
);
create policy payment_methods_write on payment_methods for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── settlements: payment method, proof screenshot, recipient can reject ────
alter table settlements add column method text;
alter table settlements add column proof_path text;

-- H5 originally let only the payer retract; now the recipient can reject a
-- claimed payment too (and the organizer branch matches what the UI already
-- gated its "retirar" button on).
drop policy if exists settlements_delete on settlements;
create policy settlements_delete on settlements for delete
  using (not confirmed and (from_user = auth.uid() or to_user = auth.uid() or is_event_organizer(event_id)));

-- ── notification templates (admin-edited CMS; outbox rows render against these) ──
create table notification_templates (
  channel notif_channel not null,
  key text not null,
  subject text,
  body text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  primary key (channel, key)
);
alter table notification_templates enable row level security;
create policy notification_templates_select on notification_templates for select using (is_app_admin());
create policy notification_templates_write on notification_templates for update using (is_app_admin());

insert into notification_templates (channel, key, subject, body) values
  ('email', 'waitlist_promoted', '¡Ya tienes lugar!',
   'Hola {{name}}, se liberó un lugar en {{event}} y ahora vas. Entra a {{link}} para ver los detalles.'),
  ('whatsapp', 'waitlist_promoted', null,
   '🐝 {{name}}, se liberó un lugar en {{event}} y ahora vas. {{link}}'),
  ('email', 'invitation', 'Te invitaron en Hive',
   '{{inviter}} te invita a {{title}}. Entra a {{link}} para verlo y confirmar.'),
  ('whatsapp', 'invitation', null,
   '🐝 {{inviter}} te invita a {{title}} en Hive. {{link}}'),
  ('email', 'change_request_approved', 'Tu propuesta se aprobó',
   'Hola {{name}}, quien administra {{club}} aprobó tu propuesta ({{summary}}). Ya está aplicada.'),
  ('whatsapp', 'change_request_approved', null,
   '🐝 Tu propuesta en {{club}} se aprobó ({{summary}}).'),
  ('email', 'change_request_declined', 'Tu propuesta no se aprobó',
   'Hola {{name}}, quien administra {{club}} no aprobó tu propuesta ({{summary}}).'),
  ('whatsapp', 'change_request_declined', null,
   '🐝 Tu propuesta en {{club}} no se aprobó ({{summary}}).'),
  ('email', 'join_request_approved', 'Ya eres parte del club',
   'Hola {{name}}, ya eres miembro de {{club}}. Entra a {{link}} para ver los próximos eventos.'),
  ('whatsapp', 'join_request_approved', null,
   '🐝 {{name}}, ya eres parte de {{club}}. {{link}}'),
  ('email', 'join_request_declined', 'Tu solicitud no se aprobó',
   'Hola {{name}}, tu solicitud para unirte a {{club}} no se aprobó.'),
  ('whatsapp', 'join_request_declined', null,
   '🐝 Tu solicitud para unirte a {{club}} no se aprobó.'),
  -- pre-existing producer (set_event_status, 0004) - seeded so its insert keeps
  -- satisfying the new template FK below; not wired into the live dispatch
  -- pipeline in this pass (only waitlist/invitation/approval triggers are).
  ('email', 'event_cancelled', 'Se canceló un evento',
   'Hola {{name}}, se canceló {{event}}. Cualquier saldo pendiente sigue en pie hasta liquidarse.'),
  ('whatsapp', 'event_cancelled', null,
   '🐝 Se canceló {{event}}. Cualquier saldo pendiente sigue en pie hasta liquidarse.');

-- outbox rows must reference a real template, and can only be queued/updated
-- by someone with an actual reason to notify that recipient (self, app admin,
-- a shared club/event, or the manager deciding their join/change request) -
-- mirrors users_select's shared-club/event trust boundary rather than
-- trusting every active user with everyone's inbox. Invitations go straight
-- through sendEmail() instead of the outbox, since an invitee usually has no
-- `users` row yet for the outbox's user_id FK to point at.
alter table notification_outbox add constraint notification_outbox_template_fk
  foreign key (channel, template) references notification_templates (channel, key);

create policy outbox_insert on notification_outbox for insert with check (
  is_active_user() and (
    user_id = auth.uid()
    or is_app_admin()
    or exists (select 1 from club_members a join club_members b on a.club_id = b.club_id
               where a.user_id = notification_outbox.user_id and b.user_id = auth.uid())
    or exists (select 1 from event_members a join event_members b on a.event_id = b.event_id
               where a.user_id = notification_outbox.user_id and b.user_id = auth.uid())
    or exists (select 1 from club_join_requests jr where jr.user_id = notification_outbox.user_id and is_club_manager(jr.club_id))
    or exists (select 1 from change_requests cr where cr.requested_by = notification_outbox.user_id and is_club_manager(cr.club_id))
  ));
create policy outbox_update on notification_outbox for update using (
  is_active_user() and (
    user_id = auth.uid()
    or is_app_admin()
    or exists (select 1 from club_members a join club_members b on a.club_id = b.club_id
               where a.user_id = notification_outbox.user_id and b.user_id = auth.uid())
    or exists (select 1 from event_members a join event_members b on a.event_id = b.event_id
               where a.user_id = notification_outbox.user_id and b.user_id = auth.uid())
    or exists (select 1 from club_join_requests jr where jr.user_id = notification_outbox.user_id and is_club_manager(jr.club_id))
    or exists (select 1 from change_requests cr where cr.requested_by = notification_outbox.user_id and is_club_manager(cr.club_id))
  ));

-- ── storage buckets ──────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('banners', 'banners', true),
  ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- avatars: public bucket, so reads go through the public object URL without
-- any SELECT policy (Supabase security advisor: a broad SELECT policy here
-- would only add an unneeded "list every file in the bucket" capability).
-- Only the owner (folder = uid) can write.
create policy avatars_write on storage.objects for insert with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- banners: public bucket, same reasoning; folder = club id, club managers can write
create policy banners_write on storage.objects for insert with check (
  bucket_id = 'banners' and is_club_manager((storage.foldername(name))[1]::uuid));
create policy banners_update on storage.objects for update using (
  bucket_id = 'banners' and is_club_manager((storage.foldername(name))[1]::uuid));
create policy banners_delete on storage.objects for delete using (
  bucket_id = 'banners' and is_club_manager((storage.foldername(name))[1]::uuid));

-- payment-proofs: private. Folder = uploader's uid. Visible to the uploader,
-- and to whoever it settles to once a settlement row references it.
create policy payment_proofs_select on storage.objects for select using (
  bucket_id = 'payment-proofs' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from settlements s where s.proof_path = storage.objects.name and s.to_user = auth.uid())
  ));
create policy payment_proofs_write on storage.objects for insert with check (
  bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
