-- 0011: stop losing the verdict on a WhatsApp send.
--
-- A Zernio broadcast takes about ten seconds to resolve, and the send was
-- waiting for it inside the request. Vercel's function budget is shorter than
-- that, so the invocation was killed after the message went out but before the
-- row was updated, leaving it 'queued' forever. Worse than losing the status:
-- a 'queued' row is a row the dispatcher would happily send again, and the
-- broadcast had already been created and billed.
--
-- So the handoff and the verdict are now separate. Sending records the
-- provider's id and parks the row in 'pending', and a later pass asks Zernio
-- what happened. Nothing re-sends, because 'pending' is not 'queued'.

alter type public.notif_status add value if not exists 'pending';

-- The provider's own id for this send (a Zernio broadcast id). Kept so the
-- outcome can be looked up later instead of inferred, and so a support
-- question about one message can be traced to one broadcast.
alter table public.notification_outbox
  add column if not exists provider_ref text;

-- The reconciler's working set: pending rows that carry a reference.
create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (status, created_at)
  where provider_ref is not null;
