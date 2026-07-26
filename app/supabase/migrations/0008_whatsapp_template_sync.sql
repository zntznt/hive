-- WhatsApp templates live in two places and the app has to reconcile them.
-- The body an admin edits here is Hive's own copy, used to render the message
-- text. Meta will only deliver a template it has approved, so each whatsapp
-- row also tracks its counterpart on the provider side: whether it has been
-- submitted, what Meta said, and the placeholder order.
--
-- The order matters. Hive bodies use named placeholders ({{event}}, {{link}})
-- because they are readable; Meta templates use positional ones ({{1}},
-- {{2}}). wa_vars stores the names in the order they were submitted, so the
-- sender can turn a payload object into the positional array Meta expects.
-- It is written at submit time, never inferred at send time, so editing the
-- body here cannot silently reorder the arguments of an already-approved
-- template.

alter table notification_templates add column wa_status text
  check (wa_status in ('pending', 'approved', 'rejected', 'paused', 'disabled'));
alter table notification_templates add column wa_language text not null default 'es_MX';
alter table notification_templates add column wa_vars text[] not null default '{}';
alter table notification_templates add column wa_synced_at timestamptz;
alter table notification_templates add column wa_error text;

-- admins already hold the only write policy on this table (0001); the sync
-- action runs through it, so nothing new is granted here.

comment on column notification_templates.wa_status is
  'Meta review state of the submitted template; null means never submitted';
comment on column notification_templates.wa_vars is
  'named placeholders in the positional order submitted to Meta';
