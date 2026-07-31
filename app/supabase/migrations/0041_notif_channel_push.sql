-- Push is a third delivery channel next to email and WhatsApp.
--
-- On its own, because a new enum value cannot be used in the same transaction
-- that adds it, and everything that follows (the outbox rows, the templates
-- keyed on channel) needs to name it.
alter type public.notif_channel add value if not exists 'push';
