-- The other half of the July batch that never reached version control.
--
-- 0057 recovered `event_comments`, which production's ledger credits to a
-- `0016_event_thread` with no file here. A full schema diff between a fresh
-- `sandbox:reset` and production turned up the rest of it, and it belongs to
-- the neighbouring `0018_event_bin_and_snooze`, also fileless. The snooze half
-- made it in (plate_snoozes is here); the bin half did not.
--
-- Two objects, and the first one breaks a feature rather than slowing it down:
--
--   change_requests_kind_check allows seven kinds here and nine on production.
--   actions.ts writes `event_delete` and `event_restore` into that column when
--   an organizer asks an admin to bin or restore an event, so on a database
--   built from these files that request fails the check and the whole flow is
--   dead. Binning is an admin's call and asking is how an organizer reaches
--   it, which makes this the same shape as the thread: works in production,
--   works nowhere else.
--
--   events_deleted_idx is the partial index behind the bin listing and behind
--   purge_deleted_events, which walks events by deleted_at every night.
--
-- What the diff did NOT find is worth recording too, because it is most of the
-- schema: 266 columns, 13 enums, 134 grants, 78 policies, 32 RLS flags, 16
-- triggers, 2 views and every other constraint and index match exactly. So do
-- all 102 functions once comments and whitespace are stripped. Seventeen of
-- them hash differently only because their migration files were edited after
-- they had already run on production, so production holds the older text and a
-- rebuild produces the newer one. No logic differs anywhere.

-- Nine kinds, production's list. Dropped and re-added rather than patched
-- because a CHECK has no ALTER, and on production this re-validates a table
-- with a handful of rows.
alter table public.change_requests drop constraint if exists change_requests_kind_check;
alter table public.change_requests add constraint change_requests_kind_check
  check (kind = any (array[
    'about'::text,
    'category_add'::text,
    'category_edit'::text,
    'category_delete'::text,
    'banner'::text,
    'avatar'::text,
    'member_removal'::text,
    'event_delete'::text,
    'event_restore'::text
  ]));

-- Partial on purpose: almost nothing is in the bin, and the two readers of
-- this column both want only the rows that are.
create index if not exists events_deleted_idx
  on public.events (deleted_at) where deleted_at is not null;
