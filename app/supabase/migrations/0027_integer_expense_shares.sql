-- Shares that add up.
--
-- event_balances divided the expense by the share count in numeric and then
-- rounded each person independently, so the shares almost never summed to the
-- expense. Measured in the live database: 1000 cents across 3 people gave
-- 333 each (999, one cent short), 333 across 7 gave 48 each (336, three cents
-- invented), 1 cent across 2 gave 1 each.
--
-- Downstream that is not a rounding nit, it is an event that never settles.
-- With nets of +667/-333/-333 the suggested transfers collect 666 and the
-- payer keeps a permanent one cent credit; the Balances section never empties.
-- With 333/7 the residue lands on an arbitrary DEBTOR, picked by JS sort
-- stability, who is left owing three cents with no creditor to pay.
--
-- So cents are allocated once, as integers, when the expense is written, and
-- the view only ever sums them. The odd cents stay with whoever paid, which is
-- the rule the design kit states and the old code did not implement.

alter table public.expense_shares
  add column if not exists cents int not null default 0;

-- Everyone gets the floor, the payer absorbs the remainder. If the payer took
-- no share of their own (they can untick themselves) the remainder is spread
-- one cent at a time in a stable order, so it is at least deterministic rather
-- than decided by whichever row Postgres happened to return first.
create or replace function public.allocate_expense_shares(exp_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total int;
  payer uuid;
  n int;
  base int;
  rem int;
  check_sum int;
begin
  select amount_cents, payer_user_id into total, payer from expenses where id = exp_id;
  if total is null then return; end if;
  select count(*) into n from expense_shares where expense_id = exp_id;
  if n = 0 then return; end if;

  base := total / n;
  rem := total - base * n;

  update expense_shares set cents = base where expense_id = exp_id;

  if rem > 0 then
    if exists (select 1 from expense_shares where expense_id = exp_id and user_id = payer) then
      update expense_shares set cents = cents + rem
       where expense_id = exp_id and user_id = payer;
    else
      update expense_shares s set cents = s.cents + 1
        from (
          select expense_id, user_id, guest_id,
                 row_number() over (order by coalesce(user_id, guest_id)) as rn
            from expense_shares where expense_id = exp_id
        ) t
       where s.expense_id = t.expense_id
         and s.user_id is not distinct from t.user_id
         and s.guest_id is not distinct from t.guest_id
         and t.rn <= rem;
    end if;
  end if;

  -- the whole point of this migration, asserted rather than assumed
  select sum(cents) into check_sum from expense_shares where expense_id = exp_id;
  if check_sum <> total then
    raise exception 'reparto inconsistente: % centavos repartidos de %', check_sum, total;
  end if;
end $$;

-- Allocation follows the two things that can change it: who is in the split,
-- and how much the expense was. updateExpense changes amount_cents and never
-- touched shares, so without the second trigger an edited amount left every
-- share stale.
create or replace function public.reallocate_shares_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- set while deliberately moving cents between shares (a guest leaving), so
  -- the move does not trigger a re-split of the whole expense
  if coalesce(current_setting('hive.skip_expense_allocation', true), '') = 'on' then
    return null;
  end if;
  perform allocate_expense_shares(coalesce(new.expense_id, old.expense_id));
  return null;
end $$;

drop trigger if exists expense_shares_allocate on public.expense_shares;
create trigger expense_shares_allocate
after insert or delete on public.expense_shares
for each row execute function public.reallocate_shares_trg();

create or replace function public.reallocate_on_amount_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.amount_cents is distinct from old.amount_cents then
    perform allocate_expense_shares(new.id);
  end if;
  return null;
end $$;

drop trigger if exists expenses_reallocate on public.expenses;
create trigger expenses_reallocate
after update of amount_cents on public.expenses
for each row execute function public.reallocate_on_amount_change();

-- A guest leaving does not re-bill everybody else.
--
-- The view divided by a live sum(weight), so removing a guest after the fact
-- silently re-split the expense: an already settled 900 across host, member and
-- guest went from 300 each to 450 each, and the member who had already paid was
-- billed another 1.50 for someone who no longer exists. A guest's share belongs
-- to the member who brought them, so it moves there and nobody else's number
-- changes.
create or replace function public.absorb_guest_shares()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(old.promoted_to_user_id, old.host_user_id);
  r record;
begin
  if target is null then return old; end if;
  perform set_config('hive.skip_expense_allocation', 'on', true);

  for r in select expense_id, cents from expense_shares where guest_id = old.id loop
    if exists (select 1 from expense_shares where expense_id = r.expense_id and user_id = target) then
      update expense_shares set cents = cents + r.cents
       where expense_id = r.expense_id and user_id = target;
      delete from expense_shares where expense_id = r.expense_id and guest_id = old.id;
    else
      update expense_shares set user_id = target, guest_id = null
       where expense_id = r.expense_id and guest_id = old.id;
    end if;
  end loop;

  perform set_config('hive.skip_expense_allocation', '', true);
  return old;
end $$;

drop trigger if exists guests_absorb_shares on public.guests;
create trigger guests_absorb_shares
before delete on public.guests
for each row execute function public.absorb_guest_shares();

-- The view, now pure integer sums. No numeric division, no per person round,
-- so paid_cents, owed_cents and net_cents agree with each other and with the
-- expense they came from.
drop view if exists public.event_balances;
create view public.event_balances
with (security_invoker = true)
as
with flows as (
  select e.event_id,
         coalesce(g.host_user_id, s.user_id) as user_id,
         0 as paid, s.cents as owed, 0 as sett_out, 0 as sett_in
    from expenses e
    join expense_shares s on s.expense_id = e.id
    left join guests g on g.id = s.guest_id
  union all
  select event_id, payer_user_id, amount_cents, 0, 0, 0 from expenses
  union all
  select event_id, from_user, 0, 0, amount_cents, 0 from settlements where confirmed
  union all
  select event_id, to_user, 0, 0, 0, amount_cents from settlements where confirmed
)
select event_id,
       user_id,
       sum(paid)::int as paid_cents,
       sum(owed)::int as owed_cents,
       (sum(paid) - sum(owed) + sum(sett_out) - sum(sett_in))::int as net_cents
  from flows
 group by event_id, user_id;

grant select on public.event_balances to authenticated;

-- Backfill anything already stored. The tables are empty today, so this is for
-- a database restored from before this migration rather than for production.
do $$
declare e record;
begin
  for e in select id from expenses loop
    perform allocate_expense_shares(e.id);
  end loop;
end $$;
