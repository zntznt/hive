-- gen_random_bytes is pgcrypto, and on Supabase pgcrypto lives in the
-- extensions schema. rotate_club_calendar_token pinned search_path to public
-- alone, which is right for everything it touches except this, so rotating
-- answered "function gen_random_bytes(integer) does not exist".
--
-- Schema-qualifying beats widening the search_path: the pin is what stops a
-- SECURITY DEFINER function resolving a name to something a caller planted.
create or replace function public.rotate_club_calendar_token(cid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare fresh text;
begin
  if not is_club_admin(cid) then
    raise exception 'solo la administración del club puede cambiar el enlace';
  end if;
  fresh := encode(extensions.gen_random_bytes(32), 'hex');
  update clubs set calendar_token = fresh where id = cid;
  return fresh;
end;
$$;

revoke all on function public.rotate_club_calendar_token(uuid) from public, anon;
grant execute on function public.rotate_club_calendar_token(uuid) to authenticated;

-- Same reach problem waiting in the column default, which fires for every new
-- club. It resolved at DDL time so it works today, but it reads as though it
-- depends on the caller's search_path and the next person to touch it would be
-- right to worry.
alter table public.clubs
  alter column calendar_token set default encode(extensions.gen_random_bytes(32), 'hex');
