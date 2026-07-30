-- The waiting room, seen from inside it.
--
-- Everything the pending screen wants to show (who reviews accounts, how many
-- people are ahead, whether we already nudged today) lives in rows a pending
-- user cannot read: users_select scopes non-admins to their own row plus the
-- clubs they are in, and someone waiting for approval is in none. So the
-- screen either stays a spinner or the facts come from a definer function
-- that hands back exactly those facts and nothing else.

-- Public names of the people who approve accounts, plus your place in line.
-- Returns no row unless you are actually waiting, so it cannot be used to
-- enumerate the admin roster from an active session.
create or replace function public.pending_queue_status()
returns table (reviewers text[], ahead int, nudged_recently boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (select array_agg(u.display_name order by u.display_name)
         from users u
        where u.is_app_admin and u.status = 'active' and u.display_name is not null),
      '{}'
    ),
    (select count(*)::int
       from users u
      where u.status = 'pending' and u.created_at < me.created_at),
    -- a boolean rather than the timestamp, so the screen never has to read a
    -- clock to decide what to render
    exists (select 1
              from notification_outbox o
             where o.template = 'admin_pending_user'
               and o.payload->>'pending_user_id' = me.id::text
               and o.created_at > now() - interval '24 hours')
  from users me
  where me.id = auth.uid() and me.status = 'pending'
$$;

grant execute on function public.pending_queue_status() to authenticated;

-- "Ya casi": the button that asks the admins to look.
--
-- Returns the admins to notify, or nothing at all if this account already
-- nudged in the last 24 hours. The rate limit lives here rather than in the
-- action because the action runs on the caller's session and cannot see the
-- outbox rows that prove a nudge happened. A queue of one person pressing a
-- button is exactly what would make admins stop reading the notification.
create or replace function public.claim_admin_nudge()
returns setof uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from users where id = auth.uid() and status = 'pending') then
    return;
  end if;

  if exists (
    select 1 from notification_outbox
     where template = 'admin_pending_user'
       and payload->>'pending_user_id' = auth.uid()::text
       and created_at > now() - interval '24 hours'
  ) then
    return;
  end if;

  return query
    select u.id from users u where u.is_app_admin and u.status = 'active';
end;
$$;

grant execute on function public.claim_admin_nudge() to authenticated;
