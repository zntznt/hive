-- Identity is not a profile field.
--
-- users_update was `id = auth.uid()` on both sides with no column restriction,
-- and prevent_privilege_change guarded only status, is_app_admin, verified_by
-- and verified_at. `authenticated` holds column level UPDATE on every column of
-- public.users, so from the browser console anyone could write their own
-- email, phone_whatsapp and phone_verified_at.
--
-- That makes the whole of lib/phone-verify.ts decorative: the number that
-- grants WhatsApp sign-in could be set without ever proving control of it. It
-- also redirects notifications (set a stranger's number, tick notif_whatsapp,
-- and every club event messages them forever) and lets someone squat a
-- colleague's number before they link it.
--
-- Worse, both columns feed session minting: verifySigninCode looks a user up by
-- phone_whatsapp and then calls generateLink with THAT ROW's email. Set the
-- phone to one you own and the email to the victim's and you mint their
-- session. The only thing standing in the way today is that users.email is
-- citext with a unique index, so the write collides. The security of session
-- minting should not rest on a column type picked for convenience.

create or replace function public.prevent_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if coalesce(current_setting('hive.bypass_privilege_guard', true), '') = 'on' then
    return new;
  end if;
  if auth.uid() is not null and not is_app_admin() and (
    new.status is distinct from old.status
    or new.is_app_admin is distinct from old.is_app_admin
    or new.verified_by is distinct from old.verified_by
    or new.verified_at is distinct from old.verified_at
    -- identity. Changing either of these is what the verification flows are
    -- for, and they run on the service role, which does not reach this branch
    -- because auth.uid() is null there.
    or new.email is distinct from old.email
    or new.phone_whatsapp is distinct from old.phone_whatsapp
    or new.phone_verified_at is distinct from old.phone_verified_at) then
    raise exception 'esos datos se cambian verificando, no editando el perfil';
  end if;
  return new;
end $function$;

-- And a disabled account should not be editing its profile at all. Every other
-- comparable policy conjoins this; users_update did not, so it was reachable by
-- a pending account too, before any admin had approved it.
drop policy if exists users_update on public.users;
create policy users_update on public.users
for update using (id = auth.uid() and is_active_user())
with check (id = auth.uid() and is_active_user());
