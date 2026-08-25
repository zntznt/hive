-- Everybody was dealt the same bug.
--
-- 0005 added avatar_bug with `default 'bug'`, and a bug is only ever chosen in
-- the account picker, which somebody waiting for approval has not reached. So
-- the pending screen, which is the first place a new member meets the bug they
-- were dealt, showed every one of them the identical generic one, and so did
-- every roster they appeared in before they went looking for the picker.
--
-- The default cannot fix itself: a column default is one value. The deal has
-- to happen per row, at the moment the row is made.

-- 1. New accounts get a bug and a colour dealt at sign-up. This is 0007's
--    handle_new_user verbatim except for the two dealt values in the insert,
--    kept as a full replacement rather than a patch because that is how every
--    earlier change to this function was made and a partial one would leave
--    two definitions to read.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  new_status user_status := 'pending';
  dname text;
  admin record;
  bugs text[] := array['bug', 'spider', 'mosquito', 'locust', 'worm'];
  colors text[] := array['#EBA937', '#F2B84A', '#FFD27A', '#9BAF7E', '#7FA3A0', '#E08A5B', '#C98BB0', '#8AA0D9'];
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

  -- Dealt from the id, not at random: the same account always gets the same
  -- bug, so a re-run of this trigger or a restore cannot reshuffle somebody's
  -- avatar. `hashtext` is stable for a given input and its sign is undefined,
  -- hence abs().
  insert into users (id, display_name, email, phone_whatsapp, status, is_app_admin, avatar_bug, avatar_color)
  values (new.id, dname, new.email, nullif(new.phone, ''), new_status,
          exists (select 1 from app_config where admin_email is not null and admin_email = new.email),
          bugs[1 + (abs(hashtext(new.id::text)) % array_length(bugs, 1))],
          colors[1 + (abs(hashtext(new.id::text || 'c')) % array_length(colors, 1))]);

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
                   else 'member'::club_role end)
      on conflict do nothing;
    end if;
    if inv.event_id is not null then
      insert into event_members (event_id, user_id, role) values (inv.event_id, new.id, 'attendee')
      on conflict do nothing;
    end if;
  end loop;

  return new;
end $$;

-- 2. Accounts that still hold the untouched default get one dealt the same
--    way. Anybody who has been to the picker and chosen 'bug' on purpose is
--    indistinguishable from anybody who never went, which is the cost of a
--    default that was never a choice; dealing from the id keeps it stable
--    either way, and the picker still overrides it in one tap.
update users
   set avatar_bug = (array['bug', 'spider', 'mosquito', 'locust', 'worm'])[1 + (abs(hashtext(id::text)) % 5)]
 where avatar_bug = 'bug';
