-- RLS rule verification for the contributions permission model (docs/05 F6)
-- and the pending-account gate (docs/03). Run against a database seeded with
-- seed.sql. Everything rolls back — safe to re-run.
--
-- Expected output: six "PASS …" notices and zero exceptions.

begin;
set local role authenticated;

-- ── act as Jorge (regular member) ──────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

do $$
begin
  insert into contributions (event_id, kind, title, created_by, assigned_to)
  values ('e0000000-0000-4000-8000-000000000002','bring','Servilletas',
          'a2222222-2222-4222-8222-222222222222','a2222222-2222-4222-8222-222222222222');
  raise notice 'PASS 1: member can create a contribution for himself';
end $$;

do $$
begin
  begin
    insert into contributions (event_id, kind, title, created_by, assigned_to)
    values ('e0000000-0000-4000-8000-000000000002','bring','Sillas',
            'a2222222-2222-4222-8222-222222222222','a3333333-3333-4333-8333-333333333333');
    raise exception 'FAIL 2: member assigned a contribution to someone else';
  exception
    when sqlstate '42501' then
      raise notice 'PASS 2: member cannot assign to others (RLS blocked it)';
  end;
end $$;

do $$
declare n int;
begin
  update contributions set assigned_to = 'a2222222-2222-4222-8222-222222222222'
  where id = 'cb000000-0000-4000-8000-000000000003' and assigned_to is null;
  get diagnostics n = row_count;
  if n = 1 then raise notice 'PASS 3: member can claim an open contribution';
  else raise exception 'FAIL 3: claim of open contribution affected % rows', n;
  end if;
end $$;

do $$
declare n int;
begin
  update contributions set title = 'Mesa robada'
  where id = 'cb000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n = 0 then raise notice 'PASS 4: member cannot touch a contribution assigned to another member';
  else raise exception 'FAIL 4: member modified someone else''s contribution (% rows)', n;
  end if;
end $$;

-- ── act as Marta (organizer) ───────────────────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

do $$
begin
  insert into contributions (event_id, kind, title, created_by, assigned_to)
  values ('e0000000-0000-4000-8000-000000000002','bring','Bebida sin alcohol',
          'a1111111-1111-4111-8111-111111111111','a4444444-4444-4444-8444-444444444444');
  raise notice 'PASS 5: organizer can assign a contribution to another member';
end $$;

-- ── act as Ana (pending account: the verification gate) ────────────────────
select set_config('request.jwt.claims',
  '{"sub":"a5555555-5555-4555-8555-555555555555","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from events;
  if n = 0 then raise notice 'PASS 6: pending user sees zero events (is_active_user gate)';
  else raise exception 'FAIL 6: pending user can see % events', n;
  end if;
end $$;

rollback;
