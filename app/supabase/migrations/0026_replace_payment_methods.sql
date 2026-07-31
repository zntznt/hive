-- Saving how people pay you back should not be able to lose how people pay
-- you back.
--
-- savePaymentMethods deleted every row for the caller and then inserted the
-- new set as a separate statement, with the delete unchecked. `kind` came
-- straight from the form against a CHECK constraint, so a stale or crafted
-- value failed the insert AFTER the delete had committed and every saved
-- method was gone. Any error between the two did the same, and the screen kept
-- showing the rows that no longer existed until you reloaded.
--
-- One function, one transaction: either the new set replaces the old one or
-- nothing moves.
create or replace function public.replace_payment_methods(rows jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'no autenticado'; end if;

  delete from payment_methods where user_id = uid;

  insert into payment_methods (user_id, kind, value, sort)
  select uid,
         r->>'kind',
         btrim(r->>'value'),
         (ordinality - 1)::int
    from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) with ordinality as t(r, ordinality)
   where btrim(coalesce(r->>'value', '')) <> '';
end $$;

revoke execute on function public.replace_payment_methods(jsonb) from public, anon;
grant execute on function public.replace_payment_methods(jsonb) to authenticated;
