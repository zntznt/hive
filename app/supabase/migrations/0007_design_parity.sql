-- 0007: schema for the second design-parity pass: per-topic notification
-- preferences, honoring the organizer role on invitations, and templates for
-- the two notification triggers the design promises (new events, payments).

-- Per-topic notification matrix (Account page). Shape:
-- {"new_event": {"email": true, "whatsapp": false}, ...}. Missing topic or
-- key falls back to email on, whatsapp off, matching prior behavior.
alter table users add column notif_prefs jsonb not null default '{}';

-- invitations.invited_role always allowed 'organizer' as a value, but both
-- claim paths flattened anything that wasn't 'admin' down to member. Honor it
-- in the signup trigger (faithful copy of 0001's handle_new_user, only the
-- role CASE changed) and in the signed-in claim RPC below.
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
      values (inv.club_id, new.id,
              case when inv.invited_role = 'admin' then 'admin'::club_role
                   when inv.invited_role = 'organizer' then 'organizer'::club_role
                   else 'member' end)
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

create or replace function claim_invitation(invite_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv record; ev_slug text; cl_slug text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into inv from invitations where token = invite_token;
  if inv.id is null then raise exception 'invitation not found'; end if;
  if inv.claimed_by_user_id is not null and inv.claimed_by_user_id <> auth.uid() then
    raise exception 'invitation already claimed by another account';
  end if;

  if inv.club_id is not null then
    insert into club_members (club_id, user_id, role)
    values (inv.club_id, auth.uid(),
            case when inv.invited_role = 'admin' then 'admin'::club_role
                 when inv.invited_role = 'organizer' then 'organizer'::club_role
                 else 'member' end)
    on conflict do nothing;
    select slug into cl_slug from clubs where id = inv.club_id;
  end if;
  if inv.event_id is not null then
    insert into event_members (event_id, user_id) values (inv.event_id, auth.uid())
    on conflict do nothing;
    select slug into ev_slug from events where id = inv.event_id;
  end if;
  if inv.guest_id is not null then
    update guests set promoted_to_user_id = auth.uid() where id = inv.guest_id;
    update expense_shares es set user_id = auth.uid(), guest_id = null
      where es.guest_id = inv.guest_id
      and not exists (select 1 from expense_shares e2
                      where e2.expense_id = es.expense_id and e2.user_id = auth.uid());
    delete from expense_shares where guest_id = inv.guest_id;
  end if;
  if inv.auto_activate then
    perform set_config('hive.bypass_privilege_guard', 'on', true);
    update users set status = 'active' where id = auth.uid() and status = 'pending';
    perform set_config('hive.bypass_privilege_guard', '', true);
  end if;

  update invitations set claimed_by_user_id = auth.uid(), claimed_at = now()
  where id = inv.id and claimed_by_user_id is null;

  return jsonb_build_object('event_slug', ev_slug, 'club_slug', cl_slug);
end $$;

-- organizers can invite members to their club (admins keep the role picker);
-- the role restriction is enforced here, not just in the UI.
drop policy invitations_insert on invitations;
create policy invitations_insert on invitations for insert with check (
  invited_by = auth.uid() and (
    (event_id is not null and is_event_organizer(event_id))
    or (club_id is not null and (
      is_club_admin(club_id)
      or (is_club_manager(club_id) and invited_role = 'member')))
    or is_app_admin()));

-- Templates for the notification triggers wired in this pass.
insert into notification_templates (channel, key, subject, body) values
  ('email', 'new_event', 'Nuevo evento: {{title}}',
   'Hola {{name}}, {{creator}} creó "{{title}}" en {{club}}. Entra a marcar cuándo puedes: {{link}}'),
  ('whatsapp', 'new_event', null,
   '{{creator}} creó "{{title}}" en {{club}}. Marca cuándo puedes: {{link}}'),
  ('email', 'payment_received', '{{from}} dice que te pagó {{amount}}',
   'Hola {{name}}, {{from}} marcó como pagado {{amount}} de "{{event}}". Revisa el comprobante y confírmalo: {{link}}'),
  ('whatsapp', 'payment_received', null,
   '{{from}} dice que te pagó {{amount}} de "{{event}}". Confírmalo aquí: {{link}}'),
  ('email', 'payment_confirmed', '{{to}} confirmó tu pago de {{amount}}',
   'Hola {{name}}, {{to}} confirmó tu pago de {{amount}} de "{{event}}". Quedó saldado.'),
  ('whatsapp', 'payment_confirmed', null,
   '{{to}} confirmó tu pago de {{amount}} de "{{event}}". Quedó saldado.')
on conflict (channel, key) do nothing;
