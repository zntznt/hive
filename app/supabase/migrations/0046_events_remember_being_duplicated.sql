-- An event that was duplicated looks exactly like an event everybody abandoned.
--
-- duplicateEvent copies the bring list across with assigned_to set to null, so
-- the new night opens with every item unclaimed. To a member who was at the
-- last one and remembers claiming the ice, that reads as the whole club
-- quietly dropping out, which the kit calls the single most confusing moment
-- in the app.
--
-- The list can only say "these came from last time and nobody has picked one
-- up yet" if the event knows it was copied. Nothing recorded that, and it
-- cannot be inferred: an unclaimed list is also what a brand new event looks
-- like five seconds after somebody types it in.
--
-- Nullable and unconstrained on delete: the source event may go in the bin
-- later, and losing it should cost the copy nothing more than the sentence.
alter table events
  add column if not exists duplicated_from uuid references events(id) on delete set null;

comment on column events.duplicated_from is
  'the event this one was copied from, so a carried-over bring list can say so';
