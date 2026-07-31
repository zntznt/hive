-- An invitation that never stops working.
--
-- Revoking was a row delete and there was no expiry at all, so a link that
-- leaked once (a forwarded mail, a shared inbox, a chat backup, a screenshot)
-- stayed a live credential forever. And since 0020 widened the preview, that
-- credential now reads a private event's time, address and headcount, and
-- keeps reading them as they change.
--
-- Thirty days. Long enough that nobody is caught out by a slow reply, short
-- enough that a link found next year is dead. Resending sets a new window,
-- which is the natural way to revive one.

alter table public.invitations
  add column if not exists expires_at timestamptz;

-- Existing invitations get a fresh window rather than being killed on deploy.
update public.invitations
   set expires_at = now() + interval '30 days'
 where expires_at is null and claimed_by_user_id is null;

alter table public.invitations
  alter column expires_at set default (now() + interval '30 days');

-- Expiry is a fact about the invitation, so the preview reports it rather than
-- pretending the link is broken. "Se venció, pídele otro a quien te invitó" is
-- a different sentence from "no existe".
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
         u.display_name, i.claimed_by_user_id is not null,
         -- an expired link stops describing the event: the whole point is that
         -- it is no longer a read channel on a private room
         case when i.expires_at is not null and i.expires_at < now() then null else e.chosen_start end,
         case when i.expires_at is not null and i.expires_at < now() then null else e.location end,
         case when i.expires_at is not null and i.expires_at < now() then null else
           (select count(*)::int from rsvps r
             where r.event_id = e.id and r.status = 'in' and r.waitlist_pos is null) end,
         case when i.expires_at is not null and i.expires_at < now() then null else e.capacity end,
         i.declined_at is not null,
         i.expires_at is not null and i.expires_at < now()
  from invitations i
  left join clubs c on c.id = i.club_id
  left join events e on e.id = i.event_id and e.deleted_at is null
  left join users u on u.id = i.invited_by
  where i.token = invite_token
$$;

revoke execute on function public.get_invitation_preview(text) from public;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;

-- Claiming refuses an expired link. This is the one that matters: the preview
-- leaking is bad, being silently added to a club a year later is worse.
create or replace function public.claim_invitation(invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare inv record; ev_slug text; cl_slug text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into inv from invitations where token = invite_token;
  if inv.id is null then raise exception 'invitation not found'; end if;
  if inv.claimed_by_user_id is not null and inv.claimed_by_user_id <> auth.uid() then
    raise exception 'invitation already claimed by another account';
  end if;
  if inv.claimed_by_user_id is null and inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'esa invitación ya venció, pide otra a quien te invitó';
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

  update invitations set claimed_by_user_id = auth.uid(), claimed_at = now(), declined_at = null
  where id = inv.id and claimed_by_user_id is null;

  return jsonb_build_object('event_slug', ev_slug, 'club_slug', cl_slug);
end $function$;

-- And the automatic match on signup honours it too, so an expired invitation
-- cannot quietly attach itself to a new account with the same address.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  inv record;
  new_status user_status := 'pending';
  dname text;
  admin record;
  tok text;
begin
  tok := new.raw_user_meta_data->>'invite_token';
  dname := coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, new.phone, 'socio'), '@', 1));
  if exists (select 1 from app_config where admin_email is not null and admin_email = new.email) then
    new_status := 'active';
  end if;
  for inv in
    select * from invitations i
     where i.claimed_by_user_id is null
       and (i.expires_at is null or i.expires_at >= now())
       and ((tok is not null and i.token = tok)
         or (i.declined_at is null and new.email is not null and i.email = new.email)
         or (i.declined_at is null and new.phone is not null and i.phone = new.phone))
  loop
    if inv.auto_activate then new_status := 'active'; end if;
  end loop;

  insert into users (id, display_name, email, phone_whatsapp, status, is_app_admin)
  values (new.id, dname, new.email, nullif(new.phone, ''), new_status,
          exists (select 1 from app_config where admin_email is not null and admin_email = new.email));

  for inv in
    select * from invitations i
     where i.claimed_by_user_id is null
       and (i.expires_at is null or i.expires_at >= now())
       and ((tok is not null and i.token = tok)
         or (i.declined_at is null and new.email is not null and i.email = new.email)
         or (i.declined_at is null and new.phone is not null and i.phone = new.phone))
  loop
    update invitations
       set claimed_by_user_id = new.id, claimed_at = now(), declined_at = null
     where id = inv.id;
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
      values (admin.id, 'email', 'admin_pending_user',
              jsonb_build_object('pending_user', dname, 'pending_user_id', new.id::text));
    end loop;
  end if;
  return new;
end $function$;
