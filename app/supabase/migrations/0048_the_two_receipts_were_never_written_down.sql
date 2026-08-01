-- Two more columns that live on production and in no migration.
--
-- The same thing as 0021 and the 0020 ordering bug, found the same way: by
-- building a database from these files and watching the app fall over. It is
-- the third instance, so the pattern is not an accident, it is what happens
-- when the only database anyone tests against is the one that already has the
-- column.
--
-- events.scheduled_at is when an organizer locked the time and
-- events.cancelled_at is when they called it off. Both are read by the event
-- page to draw its receipts ("Marta fijó la hora hace 2h · se avisó a todos"),
-- both are on the EventRow type, and setEventStatus WRITES scheduled_at. So on
-- a database built from migrations, pinning a time did not degrade, it threw:
-- column "scheduled_at" of relation "events" does not exist.
--
-- Guarded, so this is a no-op on production and the repair on a fresh build.

alter table public.events
  add column if not exists scheduled_at timestamptz,
  add column if not exists cancelled_at timestamptz;

comment on column public.events.scheduled_at is
  'When the organizer locked the time. The event page''s receipt reads from this rather than from a notification log.';
comment on column public.events.cancelled_at is
  'When the event was called off. Kept so the page can say when, rather than only that it happened.';
