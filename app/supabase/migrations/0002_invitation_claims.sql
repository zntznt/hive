-- 0002: invitation preview/claim RPCs, privilege-guard bypass for definer RPCs,
-- and atomic expense creation. Source: docs/03 (invite flows) + docs/04 (RPC list).

-- definer RPCs that legitimately change users.status set this txn-local flag
create or replace function prevent_privilege_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('hive.bypass_privilege_guard', true), '') = 'on' then
    return new;
  end if;
  if auth.uid() is not null and not is_app_admin() and (
    new.status is distinct from old.status
    or new.is_app_admin is distinct from old.is_app_admin
    or new.verified_by is distinct from old.verified_by
    or new.verified_at is distinct from old.verified_at) then
    raise exception 'only the app admin can change account status';
  end if;
  return new;
end $$;

-- anyone holding the token may preview what they were invited to (pre-auth)
create or replace function get_invitation_preview(invite_token text)
returns table (club_name text, club_slug text, event_title text, event_slug text,
               email citext, phone text, inviter text, claimed boolean)
language sql stable security definer set search_path = public as $$
  select c.name, c.slug, e.title, e.slug, i.email, i.phone,
         u.display_name, i.claimed_by_user_id is not null
  from invitations i
  left join clubs c on c.id = i.club_id
  left join events e on e.id = i.event_id
  left join users u on u.id = i.invited_by
  where i.token = invite_token
$$;

-- signed-in claim: token possession attaches memberships to the current account
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
            case when inv.invited_role = 'admin' then 'admin'::club_role else 'member' end)
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

-- atomic expense + shares; payer is the caller; currency follows the club
create or replace function add_expense_with_shares(
  eid uuid, amount int, note_text text, user_ids uuid[], guest_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare exp_id uuid; cur char(3); n int;
begin
  if not is_active_user() or not is_event_member(eid) then
    raise exception 'not an event member';
  end if;
  if amount is null or amount <= 0 then raise exception 'amount must be positive'; end if;
  if coalesce(trim(note_text), '') = '' then raise exception 'note is required'; end if;
  select coalesce(c.currency, 'EUR') into cur
    from events e left join clubs c on c.id = e.club_id where e.id = eid;

  insert into expenses (event_id, payer_user_id, amount_cents, currency, note, created_by)
  values (eid, auth.uid(), amount, cur, trim(note_text), auth.uid())
  returning id into exp_id;

  insert into expense_shares (expense_id, user_id)
  select exp_id, em.user_id from event_members em
  where em.event_id = eid and em.user_id = any(coalesce(user_ids, '{}'));

  insert into expense_shares (expense_id, guest_id)
  select exp_id, g.id from guests g
  where g.event_id = eid and g.id = any(coalesce(guest_ids, '{}'))
    and g.promoted_to_user_id is null;

  select count(*) into n from expense_shares where expense_id = exp_id;
  if n = 0 then raise exception 'pick at least one participant'; end if;
  return exp_id;
end $$;