-- Hive demo seed: club "Los Jueves" with one past event (attendance + expenses),
-- one event mid-scheduling (grid + poll + contributions), and a pending account
-- so the admin queue has something to verify.
-- Run AFTER 0001_init.sql. Idempotent-ish: do not run twice (fixed uuids will conflict).

-- IMPORTANT: replace with YOUR email before seeding (the account that signs in
-- with this address auto-activates as app admin). Or update it after seeding:
--   update app_config set admin_email = 'you@example.com';
insert into app_config (id, admin_email) values (true, 'admin@example.com')
on conflict (id) do update set admin_email = excluded.admin_email;

-- demo people (auth.users insert fires handle_new_user → public.users rows)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000','a1111111-1111-4111-8111-111111111111','authenticated','authenticated','marta@demo.hive','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Marta"}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','a2222222-2222-4222-8222-222222222222','authenticated','authenticated','jorge@demo.hive','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Jorge"}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','a3333333-3333-4333-8333-333333333333','authenticated','authenticated','lucia@demo.hive','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Lucía"}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','a4444444-4444-4444-8444-444444444444','authenticated','authenticated','pablo@demo.hive','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Pablo"}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','a5555555-5555-4555-8555-555555555555','authenticated','authenticated','ana@demo.hive','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Ana"}',now(),now(),'','','','');

-- activate the regulars; Ana stays pending (admin-queue demo). Marta doubles as demo app admin.
update users set status = 'active'
  where email in ('marta@demo.hive','jorge@demo.hive','lucia@demo.hive','pablo@demo.hive');
update users set is_app_admin = true where email = 'marta@demo.hive';

insert into clubs (id, slug, name, currency, created_by)
values ('c0000000-0000-4000-8000-000000000001','los-jueves','Los Jueves','MXN','a1111111-1111-4111-8111-111111111111');
-- trigger made Marta club admin; add the rest
insert into club_members (club_id, user_id) values
  ('c0000000-0000-4000-8000-000000000001','a2222222-2222-4222-8222-222222222222'),
  ('c0000000-0000-4000-8000-000000000001','a3333333-3333-4333-8333-333333333333'),
  ('c0000000-0000-4000-8000-000000000001','a4444444-4444-4444-8444-444444444444');

insert into event_categories (id, club_id, name, emoji) values
  ('ca000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Juegos de mesa','🎲'),
  ('ca000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','Scrapbooking','✂️'),
  ('ca000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001','Cine','🎬'),
  ('ca000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000001','Wargames','⚔️');

-- past event: attendance + money story
insert into events (id, club_id, category_id, slug, title, status, organizer_user_id,
  location, chosen_start, chosen_end)
values ('e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',
  'ca000000-0000-4000-8000-000000000001','demo-catan','Noche de Catan','done',
  'a1111111-1111-4111-8111-111111111111','casa de Marta',
  now() - interval '18 days', now() - interval '18 days' + interval '4 hours');

insert into event_members (event_id, user_id) values
  ('e0000000-0000-4000-8000-000000000001','a2222222-2222-4222-8222-222222222222'),
  ('e0000000-0000-4000-8000-000000000001','a3333333-3333-4333-8333-333333333333'),
  ('e0000000-0000-4000-8000-000000000001','a4444444-4444-4444-8444-444444444444');

insert into rsvps (event_id, user_id, status) values
  ('e0000000-0000-4000-8000-000000000001','a1111111-1111-4111-8111-111111111111','in'),
  ('e0000000-0000-4000-8000-000000000001','a2222222-2222-4222-8222-222222222222','in'),
  ('e0000000-0000-4000-8000-000000000001','a3333333-3333-4333-8333-333333333333','in'),
  ('e0000000-0000-4000-8000-000000000001','a4444444-4444-4444-8444-444444444444','out');

insert into expenses (id, event_id, payer_user_id, amount_cents, currency, note, created_by) values
  ('ee000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','a1111111-1111-4111-8111-111111111111',34500,'MXN','Pizzas','a1111111-1111-4111-8111-111111111111'),
  ('ee000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000001','a2222222-2222-4222-8222-222222222222',8000,'MXN','Hielo y vasos','a2222222-2222-4222-8222-222222222222');

insert into expense_shares (expense_id, user_id) values
  ('ee000000-0000-4000-8000-000000000001','a1111111-1111-4111-8111-111111111111'),
  ('ee000000-0000-4000-8000-000000000001','a2222222-2222-4222-8222-222222222222'),
  ('ee000000-0000-4000-8000-000000000001','a3333333-3333-4333-8333-333333333333'),
  ('ee000000-0000-4000-8000-000000000002','a1111111-1111-4111-8111-111111111111'),
  ('ee000000-0000-4000-8000-000000000002','a2222222-2222-4222-8222-222222222222'),
  ('ee000000-0000-4000-8000-000000000002','a3333333-3333-4333-8333-333333333333');

insert into settlements (event_id, from_user, to_user, amount_cents) values
  ('e0000000-0000-4000-8000-000000000001','a3333333-3333-4333-8333-333333333333','a1111111-1111-4111-8111-111111111111',14170);

-- upcoming event: scheduling grid live (5 days × 19:00–23:00, 60-min slots → 20 slots)
insert into events (id, club_id, category_id, slug, title, status, organizer_user_id,
  allow_guests, sched_start_date, sched_end_date, sched_time_min, sched_time_max, sched_slot_minutes)
values ('e0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001',
  'ca000000-0000-4000-8000-000000000001','demo-twilight','Twilight Imperium','scheduling',
  'a1111111-1111-4111-8111-111111111111',true,
  current_date + 5, current_date + 9, 1140, 1380, 60);

insert into event_members (event_id, user_id) values
  ('e0000000-0000-4000-8000-000000000002','a2222222-2222-4222-8222-222222222222'),
  ('e0000000-0000-4000-8000-000000000002','a3333333-3333-4333-8333-333333333333'),
  ('e0000000-0000-4000-8000-000000000002','a4444444-4444-4444-8444-444444444444');

insert into availability (event_id, user_id, slots) values
  ('e0000000-0000-4000-8000-000000000002','a1111111-1111-4111-8111-111111111111','{1,2,3,5,6,7,13,14}'),
  ('e0000000-0000-4000-8000-000000000002','a2222222-2222-4222-8222-222222222222','{2,3,6,7,14,15}'),
  ('e0000000-0000-4000-8000-000000000002','a3333333-3333-4333-8333-333333333333','{2,3,7}'),
  ('e0000000-0000-4000-8000-000000000002','a4444444-4444-4444-8444-444444444444','{13,14,15}');

insert into rsvps (event_id, user_id, status) values
  ('e0000000-0000-4000-8000-000000000002','a1111111-1111-4111-8111-111111111111','in'),
  ('e0000000-0000-4000-8000-000000000002','a2222222-2222-4222-8222-222222222222','in');

insert into contributions (id, event_id, kind, title, qty, created_by, assigned_to, done) values
  ('cb000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','bring','Hielo','2 bolsas','a2222222-2222-4222-8222-222222222222','a2222222-2222-4222-8222-222222222222',false),
  ('cb000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002','bring','Mesa plegable',null,'a1111111-1111-4111-8111-111111111111','a3333333-3333-4333-8333-333333333333',false),
  ('cb000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000002','bring','Altavoz',null,'a1111111-1111-4111-8111-111111111111',null,false),
  ('cb000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-000000000002','task','Recoger la tarta',null,'a1111111-1111-4111-8111-111111111111',null,false);

insert into guests (id, event_id, host_user_id, name) values
  ('ab000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','a2222222-2222-4222-8222-222222222222','Nico');

insert into polls (id, event_id, created_by, question) values
  ('aa000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','a2222222-2222-4222-8222-222222222222','¿A qué jugamos primero?');
insert into poll_options (id, poll_id, label, sort) values
  ('ab100000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Twilight Imperium',1),
  ('ab100000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000001','Catan',2),
  ('ab100000-0000-4000-8000-000000000003','aa000000-0000-4000-8000-000000000001','Póker',3);
insert into votes (poll_id, option_id, user_id) values
  ('aa000000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','a1111111-1111-4111-8111-111111111111'),
  ('aa000000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','a2222222-2222-4222-8222-222222222222'),
  ('aa000000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000002','a3333333-3333-4333-8333-333333333333');

-- one open invitation, so the invite flow has a live token to claim
insert into invitations (event_id, email, invited_by)
values ('e0000000-0000-4000-8000-000000000002','nuevo@demo.hive','a1111111-1111-4111-8111-111111111111');
