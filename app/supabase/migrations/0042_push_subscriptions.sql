-- Where a push notification is actually delivered.
--
-- Email and WhatsApp are addresses that belong to a person. Push is not: the
-- subscription belongs to one browser on one machine, a person can have
-- several, and any of them can be revoked by the browser without telling us.
-- So this is a table rather than a column on users, and the send path has to
-- expect an endpoint to have died since it was stored.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- the push service's URL for this browser, and the two keys its payload
  -- encryption needs. Unique because re-subscribing the same browser must
  -- update the row rather than collect duplicates that all ring at once.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  -- "Chrome en Android", so the account screen can say which device it means.
  -- Push is per browser per machine, and a row that just says "on" is wrong on
  -- the person's other phone.
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Yours and nobody else's, in all four directions. The dispatcher reads them
-- with the service key, like the rest of the pipeline.
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
for select to authenticated using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
for insert to authenticated with check (user_id = auth.uid() and is_active_user());

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
for delete to authenticated using (user_id = auth.uid());

-- The outbox has a foreign key on (channel, template), so a push row can only
-- exist for a template that has a push version. Subject is the notification
-- title and body is the line under it: a push has room for about that much,
-- and the email copy is written to be read at leisure.
insert into public.notification_templates (channel, key, subject, body) values
  ('push', 'new_event',               'Nuevo evento: {{title}}',            '{{creator}} creó "{{title}}" en {{club}}. Marca cuándo puedes.'),
  ('push', 'event_today',             'Hoy es {{event}}',                   'Empieza a las {{time}}.'),
  ('push', 'waitlist_promoted',       'Ya tienes lugar',                    'Se liberó un lugar en {{event}} y ahora vas.'),
  ('push', 'rsvp_pending',            'Falta tu respuesta',                 '¿Vas a "{{event}}"? Es el {{when}}.'),
  ('push', 'availability_pending',    'Falta tu disponibilidad',            'Marca cuándo puedes para "{{event}}".'),
  ('push', 'payment_received',        '{{from}} dice que te pagó',          '{{amount}} de "{{event}}". Revísalo y confirma.'),
  ('push', 'payment_confirmed',       '{{to}} confirmó tu pago',            '{{amount}} de "{{event}}". Quedaron a mano.'),
  ('push', 'change_request_approved', 'Tu propuesta se aprobó',             'Quien administra {{club}} aprobó tu propuesta.'),
  ('push', 'change_request_declined', 'Tu propuesta no se aprobó',          'Quien administra {{club}} no aprobó tu propuesta.'),
  ('push', 'join_request_approved',   'Ya eres parte del club',             'Ya eres miembro de {{club}}.'),
  ('push', 'join_request_declined',   'Tu solicitud no se aprobó',          'Tu solicitud para unirte a {{club}} no se aprobó.'),
  ('push', 'event_cancelled',         'Se canceló un evento',               'Se canceló {{event}}. Los saldos pendientes siguen.'),
  ('push', 'admin_pending_user',      'Alguien espera aprobación',          '{{pending_user}} se registró y espera que le abran la puerta.')
on conflict (channel, key) do nothing;
