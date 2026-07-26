-- Day-of reminder for people who said they are going. Unlike every other
-- template, nothing a member does triggers this one: it fires from a
-- scheduled job, so the bodies carry the event time and a direct link.
--
-- The WhatsApp wording follows Meta's content rules, learned from its
-- rejections: a placeholder may not open or close the body, and a short body
-- cannot carry many placeholders. Keep both in mind when editing this in the
-- admin panel, or Meta will refuse the resubmission.

insert into notification_templates (channel, key, subject, body) values
  ('email', 'event_today', 'Hoy es {{event}}',
   'Hola {{name}}, hoy es el día. "{{event}}" empieza a las {{time}}. Puedes ver todos los detalles aquí: {{link}} ¡Nos vemos!'),
  ('whatsapp', 'event_today', null,
   'Hola {{name}}, te recordamos que hoy es "{{event}}" y empieza a las {{time}}. Puedes ver todos los detalles aquí: {{link}} ¡Nos vemos!')
on conflict (channel, key) do nothing;

-- the reminder job looks up today's events by start time
create index if not exists events_chosen_start_idx on events (chosen_start)
  where chosen_start is not null;
