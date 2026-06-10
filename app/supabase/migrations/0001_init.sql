-- event-planner schema v0 — source: docs/04-data-model.md
create extension if not exists citext;

create type user_status as enum ('pending','active','disabled');
create type club_role as enum ('admin','member');
create type event_role as enum ('organizer','member');
create type event_status as enum ('draft','scheduling','scheduled','done','cancelled');
create type join_policy as enum ('club_members_only','anyone_with_link','invite_only');
create type rsvp_status as enum ('in','out','maybe');
create type contribution_kind as enum ('bring','task');
create type poll_kind as enum ('single','multi');
create type poll_results_visibility as enum ('always','after_close');
create type notif_channel as enum ('whatsapp','email');
create type notif_status as enum ('queued','sent','failed','logged');
create type invite_status as enum ('invited','joined');

create table app_config (
  id boolean primary key default true check (id),
  admin_email citext
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_color text,
  email citext unique,
  phone_whatsapp text unique,
  status user_status not null default 'pending',
  is_app_admin boolean not null default false,
  verified_by uuid references users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (email is not null or phone_whatsapp is not null)
);

create table clubs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  currency char(3) not null default 'EUR',
  settings jsonb not null default '{}',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table club_members (
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role club_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table event_categories (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  name text not null,
  emoji text,
  color text,
  unique (club_id, name)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade,
  category_id uuid references event_categories(id) on delete set null,
  slug text unique not null,
  title text not null,
  description text,
  location text,
  status event_status not null default 'draft',
  organizer_user_id uuid not null references users(id),
  join_policy join_policy not null default 'club_members_only',
  allow_guests boolean not null default false,
  capacity int,
  waitlist_enabled boolean not null default false,
  confirm_deadline timestamptz,
  sched_start_date date,
  sched_end_date date,
  sched_time_min smallint not null default 0,
  sched_time_max smallint not null default 1440,
  sched_slot_minutes smallint not null default 30,
  chosen_start timestamptz,
  chosen_end timestamptz,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table event_members (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role event_role not null default 'member',
  invite_status invite_status not null default 'invited',
  primary key (event_id, user_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  email citext,
  phone text,
  invited_role text not null default 'member',
  token text unique not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  auto_activate boolean not null default false,
  invited_by uuid not null references users(id),
  claimed_by_user_id uuid references users(id),
  claimed_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (club_id is not null or event_id is not null),
  check (email is not null or phone is not null)
);

create table availability (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  slots int[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table rsvps (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status rsvp_status not null,
  confirmed_at timestamptz,
  waitlist_pos int,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  host_user_id uuid not null references users(id),
  name text not null,
  promoted_to_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

alter table invitations add column guest_id uuid references guests(id) on delete set null;

create table contributions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  kind contribution_kind not null default 'bring',
  title text not null,
  qty text,
  created_by uuid not null references users(id),
  assigned_to uuid references users(id),
  due timestamptz,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  payer_user_id uuid not null references users(id),
  amount_cents int not null check (amount_cents > 0),
  currency char(3) not null,
  note text not null,
  spent_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table expense_shares (
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid references users(id),
  guest_id uuid references guests(id) on delete cascade,
  weight numeric not null default 1 check (weight > 0),
  check ((user_id is null) <> (guest_id is null))
);
create unique index expense_shares_uniq on expense_shares (expense_id, coalesce(user_id, guest_id));

create table settlements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  from_user uuid not null references users(id),
  to_user uuid not null references users(id),
  amount_cents int not null check (amount_cents > 0),
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  created_by uuid not null references users(id),
  question text not null,
  kind poll_kind not null default 'single',
  anonymous boolean not null default false,
  closes_at timestamptz,
  show_results poll_results_visibility not null default 'always',
  applied_option_id uuid,
  created_at timestamptz not null default now()
);

create table poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  label text not null,
  sort int not null default 0
);
alter table polls add constraint polls_applied_option_fk
  foreign key (applied_option_id) references poll_options(id) on delete set null;

create table votes (
  poll_id uuid not null references polls(id) on delete cascade,
  option_id uuid not null references poll_options(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (poll_id, option_id, user_id)
);

create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  channel notif_channel not null,
  template text not null,
  payload jsonb not null default '{}',
  status notif_status not null default 'queued',
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create table activity_log (
  id bigint primary key generated always as identity,
  club_id uuid,
  event_id uuid,
  user_id uuid,
  verb text not null,
  payload jsonb not null default '{}',
  at timestamptz not null default now()
);

create index on events (club_id, status);
create index on events (category_id);
create index on event_members (user_id);
create index on rsvps (user_id);
create index on expenses (event_id);
create index on expense_shares (user_id);
create index on contributions (event_id, assigned_to);
create index on invitations (email);
create index on invitations (phone);
create index on votes (user_id);
create index on activity_log (event_id, at desc);
create index on notification_outbox (status);

-- ── helpers ────────────────────────────────────────────────────────────────
create or replace function is_active_user() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from users where id = auth.uid() and status = 'active') $$;

create or replace function is_app_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from users where id = auth.uid() and status = 'active' and is_app_admin) $$;

create or replace function is_club_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from club_members where club_id = cid and user_id = auth.uid()) $$;

create or replace function is_club_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select is_app_admin() or exists
   (select 1 from club_members where club_id = cid and user_id = auth.uid() and role = 'admin') $$;

create or replace function is_event_member(eid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from event_members where event_id = eid and user_id = auth.uid()) $$;

create or replace function is_event_organizer(eid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select is_app_admin()
       or exists (select 1 from events e where e.id = eid and
                  (e.organizer_user_id = auth.uid()
                   or (e.club_id is not null and is_club_admin(e.club_id))))
       or exists (select 1 from event_members where event_id = eid and user_id = auth.uid() and role = 'organizer') $$;

create or replace function can_see_event(eid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select is_event_member(eid) or is_event_organizer(eid) or exists
   (select 1 from events e where e.id = eid and e.club_id is not null and is_club_member(e.club_id)) $$;

-- ── row level security ─────────────────────────────────────────────────────
alter table app_config enable row level security;
alter table users enable row level security;
alter table clubs enable row level security;
alter table club_members enable row level security;
alter table event_categories enable row level security;
alter table events enable row level security;
alter table event_members enable row level security;
alter table invitations enable row level security;
alter table availability enable row level security;
alter table rsvps enable row level security;
alter table guests enable row level security;
alter table contributions enable row level security;
alter table expenses enable row level security;
alter table expense_shares enable row level security;
alter table settlements enable row level security;
alter table polls enable row level security;
alter table poll_options enable row level security;
alter table votes enable row level security;
alter table notification_outbox enable row level security;
alter table activity_log enable row level security;

create policy users_select on users for select using (
  id = auth.uid() or is_app_admin()
  or (is_active_user() and (
    exists (select 1 from club_members a join club_members b on a.club_id = b.club_id
            where a.user_id = auth.uid() and b.user_id = users.id)
    or exists (select 1 from event_members a join event_members b on a.event_id = b.event_id
               where a.user_id = auth.uid() and b.user_id = users.id))));
create policy users_update on users for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy clubs_select on clubs for select using (is_active_user() and (is_club_member(id) or is_app_admin()));
create policy clubs_insert on clubs for insert with check (is_active_user() and created_by = auth.uid());
create policy clubs_update on clubs for update using (is_club_admin(id));

create policy club_members_select on club_members for select
  using (is_active_user() and (is_club_member(club_id) or is_app_admin()));
create policy club_members_write on club_members for insert with check (is_club_admin(club_id));
create policy club_members_delete on club_members for delete
  using (is_club_admin(club_id) or user_id = auth.uid());

create policy event_categories_select on event_categories for select
  using (is_active_user() and is_club_member(club_id));
create policy event_categories_all on event_categories for all
  using (is_club_admin(club_id)) with check (is_club_admin(club_id));

create policy events_select on events for select using (is_active_user() and can_see_event(id));
create policy events_insert on events for insert with check (
  is_active_user() and organizer_user_id = auth.uid()
  and (club_id is null or is_club_member(club_id)));
create policy events_update on events for update using (is_event_organizer(id));

create policy event_members_select on event_members for select
  using (is_active_user() and can_see_event(event_id));
create policy event_members_insert on event_members for insert with check (is_event_organizer(event_id));
create policy event_members_delete on event_members for delete
  using (is_event_organizer(event_id) or user_id = auth.uid());

create policy invitations_select on invitations for select using (
  (event_id is not null and is_event_organizer(event_id))
  or (club_id is not null and is_club_admin(club_id)) or is_app_admin());
create policy invitations_insert on invitations for insert with check (
  invited_by = auth.uid() and (
    (event_id is not null and is_event_organizer(event_id))
    or (club_id is not null and is_club_admin(club_id)) or is_app_admin()));

create policy availability_select on availability for select
  using (is_active_user() and can_see_event(event_id));
create policy availability_write on availability for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_event_member(event_id));

create policy rsvps_select on rsvps for select using (is_active_user() and can_see_event(event_id));
create policy rsvps_write on rsvps for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_event_member(event_id));

create policy guests_select on guests for select using (is_active_user() and can_see_event(event_id));
create policy guests_insert on guests for insert with check (
  is_event_member(event_id) and (host_user_id = auth.uid() or is_event_organizer(event_id))
  and exists (select 1 from events e where e.id = event_id and e.allow_guests));
create policy guests_delete on guests for delete
  using (host_user_id = auth.uid() or is_event_organizer(event_id));

-- the contributions rule: members create/claim for THEMSELVES; organizers are free
create policy contributions_select on contributions for select
  using (is_active_user() and can_see_event(event_id));
create policy contributions_insert on contributions for insert with check (
  is_event_member(event_id) and created_by = auth.uid()
  and (is_event_organizer(event_id) or assigned_to = auth.uid()));
create policy contributions_update on contributions for update
  using (is_event_organizer(event_id) or assigned_to = auth.uid() or assigned_to is null)
  with check (is_event_organizer(event_id) or assigned_to = auth.uid());
create policy contributions_delete on contributions for delete
  using (is_event_organizer(event_id) or created_by = auth.uid());

create policy expenses_select on expenses for select using (is_active_user() and can_see_event(event_id));
create policy expenses_insert on expenses for insert with check (
  is_event_member(event_id) and created_by = auth.uid());
create policy expenses_update on expenses for update
  using (created_by = auth.uid() or payer_user_id = auth.uid() or is_event_organizer(event_id));
create policy expenses_delete on expenses for delete
  using (created_by = auth.uid() or is_event_organizer(event_id));

create policy expense_shares_select on expense_shares for select using (
  exists (select 1 from expenses e where e.id = expense_id and is_active_user() and can_see_event(e.event_id)));
create policy expense_shares_write on expense_shares for all using (
  exists (select 1 from expenses e where e.id = expense_id
          and (e.created_by = auth.uid() or is_event_organizer(e.event_id))))
  with check (
  exists (select 1 from expenses e where e.id = expense_id
          and (e.created_by = auth.uid() or is_event_organizer(e.event_id))));

create policy settlements_select on settlements for select
  using (is_active_user() and can_see_event(event_id));
create policy settlements_insert on settlements for insert with check (
  is_event_member(event_id) and (from_user = auth.uid() or is_event_organizer(event_id)));
create policy settlements_update on settlements for update
  using (to_user = auth.uid() or is_event_organizer(event_id));

create policy polls_select on polls for select using (is_active_user() and can_see_event(event_id));
create policy polls_insert on polls for insert with check (
  is_event_member(event_id) and created_by = auth.uid());
create policy polls_update on polls for update
  using (created_by = auth.uid() or is_event_organizer(event_id));

create policy poll_options_select on poll_options for select using (
  exists (select 1 from polls p where p.id = poll_id and is_active_user() and can_see_event(p.event_id)));
create policy poll_options_write on poll_options for all using (
  exists (select 1 from polls p where p.id = poll_id
          and (p.created_by = auth.uid() or is_event_organizer(p.event_id))))
  with check (
  exists (select 1 from polls p where p.id = poll_id
          and (p.created_by = auth.uid() or is_event_organizer(p.event_id))));

-- anonymous polls: individual votes only visible to their owner; use poll_results() for counts
create policy votes_select on votes for select using (
  user_id = auth.uid()
  or exists (select 1 from polls p where p.id = poll_id and not p.anonymous
             and is_active_user() and can_see_event(p.event_id)));
create policy votes_write on votes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from polls p where p.id = poll_id and is_event_member(p.event_id)
    and (p.closes_at is null or p.closes_at > now())));

create policy outbox_select on notification_outbox for select
  using (user_id = auth.uid() or is_app_admin());

create policy activity_select on activity_log for select using (
  is_app_admin()
  or (event_id is not null and is_active_user() and can_see_event(event_id))
  or (club_id is not null and is_active_user() and is_club_member(club_id)));

create policy app_config_admin on app_config for select using (is_app_admin());

-- ── triggers ───────────────────────────────────────────────────────────────
create or replace function prevent_privilege_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_app_admin() and (
    new.status is distinct from old.status
    or new.is_app_admin is distinct from old.is_app_admin
    or new.verified_by is distinct from old.verified_by
    or new.verified_at is distinct from old.verified_at) then
    raise exception 'only the app admin can change account status';
  end if;
  return new;
end $$;
create trigger users_privilege_guard before update on users
  for each row when (pg_trigger_depth() = 0) execute function prevent_privilege_change();

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  new_status user_status := 'pending';
  dname text;
  admin record;
begin
  dname := coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, new.phone, 'socio'), '@', 1));
  if exists (select 1 from app_config where admin_email is not null and admin_email = new.email) then
    new_status := 'active';
  end if;
  for inv in
    select * from invitations i where i.claimed_by_user_id is null and (
      (new.raw_user_meta_data->>'invite_token' is not null and i.token = new.raw_user_meta_data->>'invite_token')
      or (new.email is not null and i.email = new.email)
      or (new.phone is not null and i.phone = new.phone))
  loop
    if inv.auto_activate then new_status := 'active'; end if;
  end loop;

  insert into users (id, display_name, email, phone_whatsapp, status, is_app_admin)
  values (new.id, dname, new.email, nullif(new.phone, ''), new_status,
          exists (select 1 from app_config where admin_email is not null and admin_email = new.email));

  for inv in
    select * from invitations i where i.claimed_by_user_id is null and (
      (new.raw_user_meta_data->>'invite_token' is not null and i.token = new.raw_user_meta_data->>'invite_token')
      or (new.email is not null and i.email = new.email)
      or (new.phone is not null and i.phone = new.phone))
  loop
    update invitations set claimed_by_user_id = new.id, claimed_at = now() where id = inv.id;
    if inv.club_id is not null then
      insert into club_members (club_id, user_id, role)
      values (inv.club_id, new.id, case when inv.invited_role = 'admin' then 'admin'::club_role else 'member' end)
      on conflict do nothing;
    end if;
    if inv.event_id is not null then
      insert into event_members (event_id, user_id) values (inv.event_id, new.id) on conflict do nothing;
    end if;
    if inv.guest_id is not null then
      update guests set promoted_to_user_id = new.id where id = inv.guest_id;
      update expense_shares es set user_id = new.id, guest_id = null
        where es.guest_id = inv.guest_id
        and not exists (select 1 from expense_shares e2
                        where e2.expense_id = es.expense_id and e2.user_id = new.id);
      delete from expense_shares where guest_id = inv.guest_id;
    end if;
  end loop;

  if new_status = 'pending' then
    for admin in select id from users where is_app_admin and status = 'active'
    loop
      insert into notification_outbox (user_id, channel, template, payload)
      values (admin.id, 'email', 'admin_pending_user', jsonb_build_object('pending_user', dname));
    end loop;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function club_creator_becomes_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into club_members (club_id, user_id, role) values (new.id, new.created_by, 'admin')
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger clubs_creator_admin after insert on clubs
  for each row execute function club_creator_becomes_admin();

create or replace function event_organizer_becomes_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into event_members (event_id, user_id, role) values (new.id, new.organizer_user_id, 'organizer')
  on conflict do nothing;
  return new;
end $$;
create trigger events_organizer_member after insert on events
  for each row execute function event_organizer_becomes_member();

create or replace function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new);
begin
  insert into activity_log (club_id, event_id, user_id, verb, payload)
  values (
    (select e.club_id from events e where e.id = (j->>'event_id')::uuid),
    (j->>'event_id')::uuid,
    coalesce(auth.uid(), (j->>'created_by')::uuid, (j->>'user_id')::uuid, (j->>'payer_user_id')::uuid),
    tg_table_name || '.' || lower(tg_op),
    jsonb_build_object('id', coalesce(j->>'id', j->>'event_id'), 'title', j->>'title', 'note', j->>'note', 'status', j->>'status'));
  return new;
end $$;
create trigger log_rsvps after insert or update on rsvps for each row execute function log_activity();
create trigger log_contributions after insert or update on contributions for each row execute function log_activity();
create trigger log_expenses after insert on expenses for each row execute function log_activity();
create trigger log_settlements after insert or update on settlements for each row execute function log_activity();
create trigger log_polls after insert on polls for each row execute function log_activity();

create or replace function touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at := now(); return new; end $$;
create trigger touch_availability before update on availability for each row execute function touch_updated_at();
create trigger touch_rsvps before update on rsvps for each row execute function touch_updated_at();

-- ── rpcs ───────────────────────────────────────────────────────────────────
create or replace function admin_set_user_status(target uuid, new_status user_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_app_admin() then raise exception 'app admin only'; end if;
  update users set status = new_status,
    verified_by = case when new_status = 'active' then auth.uid() else verified_by end,
    verified_at = case when new_status = 'active' then now() else verified_at end
  where id = target;
  insert into activity_log (user_id, verb, payload)
  values (auth.uid(), 'user.' || new_status::text, jsonb_build_object('target', target));
end $$;

create or replace function join_event(event_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare ev record;
begin
  if not is_active_user() then raise exception 'account not active'; end if;
  select * into ev from events where slug = event_slug;
  if ev.id is null then raise exception 'event not found'; end if;
  if exists (select 1 from event_members where event_id = ev.id and user_id = auth.uid()) then
    return ev.id;
  end if;
  if ev.join_policy = 'invite_only' then
    raise exception 'event is invite only';
  elsif ev.join_policy = 'club_members_only' then
    if ev.club_id is null or not is_club_member(ev.club_id) then
      raise exception 'club members only';
    end if;
  end if;
  insert into event_members (event_id, user_id, invite_status) values (ev.id, auth.uid(), 'joined')
  on conflict do nothing;
  return ev.id;
end $$;

create or replace function rsvp_set(eid uuid, st rsvp_status) returns void
language plpgsql security definer set search_path = public as $$
declare ev record; ins int; pos int; promoted uuid;
begin
  if not is_active_user() or not is_event_member(eid) then raise exception 'not an event member'; end if;
  select * into ev from events where id = eid;
  perform pg_advisory_xact_lock(hashtext(eid::text));
  if st = 'in' and ev.capacity is not null then
    select count(*) into ins from rsvps where event_id = eid and status = 'in' and waitlist_pos is null and user_id <> auth.uid();
    if ins >= ev.capacity and ev.waitlist_enabled then
      select coalesce(max(waitlist_pos), 0) + 1 into pos from rsvps where event_id = eid;
      insert into rsvps (event_id, user_id, status, waitlist_pos) values (eid, auth.uid(), 'in', pos)
      on conflict (event_id, user_id) do update set status = 'in', waitlist_pos = excluded.waitlist_pos;
      return;
    elsif ins >= ev.capacity then
      raise exception 'event is full';
    end if;
  end if;
  insert into rsvps (event_id, user_id, status, waitlist_pos) values (eid, auth.uid(), st, null)
  on conflict (event_id, user_id) do update set status = excluded.status, waitlist_pos = null;
  if st = 'out' and ev.capacity is not null and ev.waitlist_enabled then
    update rsvps set waitlist_pos = null where event_id = eid and waitlist_pos = (
      select min(waitlist_pos) from rsvps where event_id = eid and waitlist_pos is not null)
    returning user_id into promoted;
    if promoted is not null then
      insert into notification_outbox (user_id, channel, template, payload)
      values (promoted, 'email', 'waitlist_promoted', jsonb_build_object('event_id', eid));
    end if;
  end if;
end $$;

create or replace function confirm_rsvp(eid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update rsvps set confirmed_at = now()
  where event_id = eid and user_id = auth.uid() and status = 'in';
end $$;

create or replace function pick_slot(eid uuid, slot_start timestamptz, slot_end timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if not is_event_organizer(eid) then raise exception 'organizer only'; end if;
  update events set chosen_start = slot_start, chosen_end = slot_end, status = 'scheduled' where id = eid;
  for m in select user_id from event_members where event_id = eid and user_id <> auth.uid()
  loop
    insert into notification_outbox (user_id, channel, template, payload)
    values (m.user_id,
            case when exists (select 1 from users u where u.id = m.user_id and u.phone_whatsapp is not null)
                 then 'whatsapp'::notif_channel else 'email' end,
            'event_scheduled',
            jsonb_build_object('event_id', eid, 'start', slot_start));
  end loop;
end $$;

create or replace function apply_poll_option(pid uuid, oid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select * into p from polls where id = pid;
  if not is_event_organizer(p.event_id) then raise exception 'organizer only'; end if;
  if not exists (select 1 from poll_options where id = oid and poll_id = pid) then
    raise exception 'option does not belong to poll';
  end if;
  update polls set applied_option_id = oid where id = pid;
end $$;

create or replace function poll_results(pid uuid)
returns table (option_id uuid, label text, votes bigint)
language sql stable security definer set search_path = public as $$
  select o.id, o.label, count(v.user_id)
  from poll_options o left join votes v on v.option_id = o.id
  where o.poll_id = pid
    and exists (select 1 from polls p where p.id = pid and is_active_user() and can_see_event(p.event_id))
  group by o.id, o.label order by min(o.sort)
$$;

create or replace function promote_guest(gid uuid, invite_email citext default null, invite_phone text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare g record; inv_id uuid;
begin
  select * into g from guests where id = gid;
  if g.id is null then raise exception 'guest not found'; end if;
  if not (g.host_user_id = auth.uid() or is_event_organizer(g.event_id)) then
    raise exception 'host or organizer only';
  end if;
  if invite_email is null and invite_phone is null then
    raise exception 'an email or phone is required to invite the guest';
  end if;
  insert into invitations (event_id, email, phone, invited_by, guest_id)
  values (g.event_id, invite_email, invite_phone, auth.uid(), gid) returning id into inv_id;
  return inv_id;
end $$;

-- ── derived views (security_invoker: RLS of the querying user applies) ─────
create view attendance_stats with (security_invoker = true) as
select e.club_id, r.user_id, e.category_id,
       count(*) as events_attended,
       max(coalesce(e.chosen_start, e.created_at)) as last_attended_at
from rsvps r join events e on e.id = r.event_id
where e.status = 'done' and r.status = 'in' and e.club_id is not null
group by grouping sets ((e.club_id, r.user_id, e.category_id), (e.club_id, r.user_id));

create view event_balances with (security_invoker = true) as
with share_totals as (
  select expense_id, sum(weight) as tw from expense_shares group by 1
), flows as (
  select e.event_id, coalesce(g.host_user_id, s.user_id) as user_id,
         0::numeric as paid, e.amount_cents * s.weight / st.tw as owed, 0::numeric as sett_out, 0::numeric as sett_in
  from expenses e
  join expense_shares s on s.expense_id = e.id
  join share_totals st on st.expense_id = e.id
  left join guests g on g.id = s.guest_id
  union all
  select event_id, payer_user_id, amount_cents, 0, 0, 0 from expenses
  union all
  select event_id, from_user, 0, 0, amount_cents, 0 from settlements where confirmed
  union all
  select event_id, to_user, 0, 0, 0, amount_cents from settlements where confirmed
)
select event_id, user_id,
       round(sum(paid))::int as paid_cents,
       round(sum(owed))::int as owed_cents,
       round(sum(paid) - sum(owed) + sum(sett_out) - sum(sett_in))::int as net_cents
from flows group by 1, 2;
