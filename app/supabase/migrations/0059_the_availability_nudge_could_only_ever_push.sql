-- The last of the July batch, and the only one the schema diff could not see.
--
-- Production's ledger has a `0015_availability_nudge` applied on 30 July with
-- no file here, next to the `0016_event_thread` 0057 recovered and the
-- `0018_event_bin_and_snooze` 0021 and 0058 recovered between them. It added
-- no tables, columns, policies or functions, which is why comparing the schema
-- found nothing: what it added was rows.
--
-- Production carries 72 notification_templates and a database built from these
-- files carries 69. The three missing are the availability nudge on email and
-- WhatsApp. `notify.ts` reads the template before it sends, so on a rebuilt
-- database the nudge files itself as `no_template` and nothing arrives. Push
-- works, because 0042 seeded the push pair; email and WhatsApp never were.
--
-- 0053 makes it worse in a way worth spelling out, because it is why this hid
-- for so long. It creates the English copies by selecting the Spanish rows and
-- rewriting them, so it only ever produced an English availability_pending on
-- a database that already had the Spanish one. Production had it, so
-- production got both. A fresh build had neither, and the join quietly matched
-- nothing. A seed conditional on rows only one database has is the same bug as
-- a migration only one database ran.
--
-- All three are transcribed from production, so this changes nothing there.
-- They insert rather than upsert: a template is copy an admin can edit in the
-- panel, and a migration must not overwrite what somebody has since reworded.

insert into public.notification_templates
  (channel, key, lang, subject, body, updated_at, wa_status, wa_language, wa_vars)
values
  ('whatsapp', 'availability_pending', 'es',
   null,
   'Hola {{name}}, todavía falta que marques cuándo puedes para "{{event}}". En cuanto estén todas las respuestas se fija la fecha. Marca la tuya aquí: {{link}} ¡Gracias!',
   now(), 'pending', 'es_MX', '{name,event,link}'),

  ('email', 'availability_pending', 'es',
   'Falta tu disponibilidad para {{event}}',
   'Hola {{name}},

Todavía falta que marques cuándo puedes para "{{event}}".

En cuanto estén todas las respuestas se fija la fecha. Marca la tuya aquí: {{link}}

Gracias.',
   now(), null, 'es_MX', '{}'),

  ('email', 'availability_pending', 'en',
   'We still need your availability for {{event}}',
   'Hi {{name}},

You have not marked when you can make "{{event}}" yet.

The date gets fixed once everybody has answered. Mark yours here: {{link}}

Thank you.',
   now(), null, 'es_MX', '{}')
on conflict (channel, key, lang) do nothing;
