-- RLS rule verification for the contributions permission model (docs/05 F6)
-- and the pending-account gate (docs/03). Run against a database seeded with
-- seed.sql. Everything rolls back, so it is safe to re-run.
--
-- Expected output: thirteen "PASS …" notices and zero exceptions.

begin;

-- ── who can call which function (0061) ─────────────────────────────────────
-- Everything a client is allowed to call is listed here. Anything else in
-- `public` that anon or authenticated can execute is a function exposed by
-- accident, because Postgres hands EXECUTE to PUBLIC unless told otherwise.
do $$
declare
  for_anon text[] := array[
    'is_active_user()', 'is_app_admin()', 'is_club_member(uuid)',
    'is_club_admin(uuid)', 'is_club_manager(uuid)', 'is_event_member(uuid)',
    'is_event_organizer(uuid)', 'can_see_event(uuid)',
    'get_invitation_preview(text)', 'get_club_join_preview(text)',
    'get_club_calendar(text)', 'decline_invitation(text,boolean)'];
  for_signed_in text[] := for_anon || array[
    'add_expense_with_shares(uuid,integer,text,uuid[],uuid[])',
    'admin_set_app_admin(uuid,boolean)', 'admin_set_user_status(uuid,user_status)',
    'apply_poll_option(uuid,uuid)', 'approve_change_request(uuid)',
    'approve_join_request(uuid)', 'claim_invitation(text)', 'confirm_rsvp(uuid)',
    'join_event(text)', 'mark_attendance(uuid,uuid[],uuid[])', 'nudge_admins()',
    'pending_queue_status()', 'pick_slot(uuid,timestamp with time zone,timestamp with time zone)',
    'poll_results(uuid)', 'promote_guest(uuid,citext,text)', 'promote_waitlist(uuid)',
    'replace_payment_methods(jsonb)', 'request_account_deletion()',
    'request_join_club(text)', 'rotate_club_calendar_token(uuid)',
    'rsvp_set(uuid,rsvp_status)', 'set_event_deleted(uuid,boolean)',
    'set_event_status(uuid,event_status)', 'claim_invitation_resend(uuid)'];
  service_only text[] := array[
    'purge_deleted_events(integer)', 'signin_throttle_take(text)',
    'signin_throttle_fail(text)', 'signin_throttle_ok(text)',
    'phone_verify_attempt(uuid)', 'signin_code_attempt(uuid)'];
  f text;
  r record;
begin
  -- the allowlists hold exactly what they claim
  foreach f in array for_anon loop
    if not has_function_privilege('anon', 'public.' || f, 'execute') then
      raise exception 'FAIL 0a: anon cannot call %, which a signed-out page needs', f;
    end if;
  end loop;
  foreach f in array for_signed_in loop
    if not has_function_privilege('authenticated', 'public.' || f, 'execute') then
      raise exception 'FAIL 0a: authenticated cannot call %', f;
    end if;
  end loop;
  foreach f in array service_only loop
    if not has_function_privilege('service_role', 'public.' || f, 'execute') then
      raise exception 'FAIL 0a: service_role cannot call %', f;
    end if;
  end loop;
  raise notice 'PASS 0a: every function a client needs is callable by its role';

  -- and nothing else is reachable with the public key
  for r in
    select p.oid::regprocedure::text as sig,
           regexp_replace(p.oid::regprocedure::text, '^public\.', '') as bare
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and not exists (select 1 from pg_depend d
                        where d.classid = 'pg_proc'::regclass
                          and d.objid = p.oid and d.deptype = 'e')
  loop
    if has_function_privilege('anon', r.sig, 'execute') and not r.bare = any (for_anon) then
      raise exception 'FAIL 0b: anon can call %', r.sig;
    end if;
    if has_function_privilege('authenticated', r.sig, 'execute') and not r.bare = any (for_signed_in) then
      raise exception 'FAIL 0b: authenticated can call %', r.sig;
    end if;
  end loop;
  raise notice 'PASS 0b: no other function in public is callable by anon or authenticated';
end $$;

-- A function written tomorrow is not an API until a migration says so.
create function public.rls_test_probe() returns int language sql as 'select 1';
do $$
begin
  if has_function_privilege('anon', 'public.rls_test_probe()', 'execute')
     or has_function_privilege('authenticated', 'public.rls_test_probe()', 'execute') then
    raise exception 'FAIL 0c: a new function is callable by the public key by default';
  end if;
  if not has_function_privilege('service_role', 'public.rls_test_probe()', 'execute') then
    raise exception 'FAIL 0c: a new function is not callable by service_role';
  end if;
  raise notice 'PASS 0c: a new function starts out service role only';
end $$;
drop function public.rls_test_probe();

-- The signed-out pages still work: each answers an unknown token with nothing.
set local role anon;
do $$
begin
  perform * from get_invitation_preview('no-such-token');
  perform * from get_club_join_preview('no-such-token');
  perform * from get_club_calendar('no-such-token');
  perform count(*) from events;
  raise notice 'PASS 0d: anon can open invite, join and calendar links and read through RLS';
end $$;
reset role;

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

do $$
begin
  begin
    insert into notification_outbox (user_id, channel, template, payload)
    values ('a2222222-2222-4222-8222-222222222222', 'email', 'new_event', '{"title":"<a href=x>premio</a>"}');
    raise exception 'FAIL 4b: member queued a notification of his own making';
  exception
    when sqlstate '42501' then
      raise notice 'PASS 4b: member cannot write the outbox (only the server queues mail)';
  end;
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

do $$
declare inv uuid;
begin
  insert into invitations (event_id, email, invited_by)
  values ('e0000000-0000-4000-8000-000000000002', 'nueva@demo.hive', 'a1111111-1111-4111-8111-111111111111')
  returning id into inv;
  if not claim_invitation_resend(inv) then
    raise exception 'FAIL 5b: organizer could not resend an invitation never sent';
  end if;
  if claim_invitation_resend(inv) then
    raise exception 'FAIL 5b: a second resend inside the window was allowed';
  end if;
  perform set_config('rls_test.inv', inv::text, true);
  raise notice 'PASS 5b: one resend per window, claimed atomically';
end $$;

-- a member who does not organize the event cannot resend its invitation,
-- even once the window has passed
select set_config('request.jwt.claims',
  '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
reset role;
update invitations set last_sent_at = null where id = current_setting('rls_test.inv')::uuid;
set local role authenticated;
do $$
begin
  if claim_invitation_resend(current_setting('rls_test.inv')::uuid) then
    raise exception 'FAIL 5c: a member who does not organize the event resent its invitation';
  end if;
  raise notice 'PASS 5c: only someone who manages the invitation can resend it';
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
