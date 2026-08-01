-- A done event says "celebrado" and nothing else, so the page could not tell
-- you who called it done or when. The kit puts a receipt line under the header
-- of every finished event ("Cerrado por Marta · 1 ago"), and a receipt needs
-- somebody's name on it.
--
-- cancelled_at already exists for exactly this reason, which is the argument:
-- closing is the same kind of transition and deserves the same record. Two
-- columns rather than one, because "when" without "who" is the half of the
-- sentence nobody asks for.
--
-- Old events keep null and the page falls back to the night itself, which it
-- already knows. Backfilling a name here would be inventing one.
alter table events
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references users(id);

comment on column events.closed_at is 'when the event was marked celebrated, for the receipt line';
comment on column events.closed_by is 'who marked it, for the receipt line';
