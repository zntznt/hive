-- 0014: let the outbox record messages sent to people who are not users yet.
--
-- notification_outbox.user_id was NOT NULL against public.users, which meant
-- an invitation could never be logged: the whole point of an invitation is
-- that the recipient has no account. So the admin log, which exists to answer
-- "did that message actually go out", was blind to the one kind of message
-- whose delivery nobody can verify by asking the recipient.
--
-- A row therefore identifies its recipient one of two ways: a user_id for
-- members, or a destination for everyone else.

alter table public.notification_outbox
  alter column user_id drop not null;

-- The address the message was actually sent to. Also useful on member rows:
-- it records where it went at the time, which survives someone later changing
-- their number or correo.
alter table public.notification_outbox
  add column if not exists destination text;

-- Every row still needs to say who it was for.
alter table public.notification_outbox
  drop constraint if exists notification_outbox_has_recipient;
alter table public.notification_outbox
  add constraint notification_outbox_has_recipient
  check (user_id is not null or destination is not null);

-- outbox_select is (user_id = auth.uid() OR is_app_admin()). A null user_id
-- makes the first half NULL rather than true, so these rows are visible to
-- app admins only, which is right: an invitation belongs to nobody yet.
