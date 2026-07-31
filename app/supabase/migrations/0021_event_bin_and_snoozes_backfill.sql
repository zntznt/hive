-- Schema that shipped without a file.
--
-- The event bin and the plate snooze were applied straight to production and
-- the migration was never written down, so `supabase db reset` builds a
-- database the code does not run against. This is that day's work, recovered
-- from the live schema. Everything is guarded, so it is a no-op on production
-- and the real thing on a fresh database.

alter table public.events
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.users(id);

-- Deleting an event takes attendance, expenses and a settled history with it,
-- so an admin does it and it stays recoverable for 30 days.
create or replace function public.set_event_deleted(eid uuid, deleted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare cid uuid;
begin
  select club_id into cid from events where id = eid;
  if cid is null then raise exception 'evento sin club'; end if;
  if not is_club_admin(cid) then raise exception 'solo la administración del club puede hacer esto'; end if;

  if deleted then
    update events set deleted_at = now(), deleted_by = auth.uid() where id = eid;
  else
    update events set deleted_at = null, deleted_by = null where id = eid;
  end if;
end $$;

-- Putting a plate item down until tomorrow morning. Keyed by the item identity
-- every surface agrees on (plateItemKey), not by a row id, because an item can
-- be derived rather than stored.
create table if not exists public.plate_snoozes (
  user_id uuid not null references public.users(id) on delete cascade,
  item_key text not null,
  until timestamptz not null,
  primary key (user_id, item_key)
);

alter table public.plate_snoozes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'plate_snoozes' and policyname = 'plate_snoozes_all') then
    create policy plate_snoozes_all on public.plate_snoozes
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
