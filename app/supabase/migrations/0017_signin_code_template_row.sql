-- 0017: give signin_code a row to point at.
--
-- notification_outbox has a foreign key on (channel, template) into
-- notification_templates, which is a good constraint: it stops the outbox
-- referring to a template nobody can render. I did not know it existed and
-- reasoned that signin_code needed no row, since Meta writes the body of an
-- AUTHENTICATION template and there is nothing for us to edit.
--
-- So every attempt to log a sign-in code violated the constraint, the insert
-- failed, and because that failure happened inside an after() callback it
-- left nothing behind. Four sign-in attempts produced no message and no trace
-- of why, and the trace was the thing I kept trying to fix.
--
-- The body here is documentation, not copy. Meta composes the real message
-- from the template named in wa_name, and refuses to let anyone change it,
-- which is the point of the authentication category.

insert into public.notification_templates (channel, key, subject, body, wa_language, wa_vars, wa_status, wa_synced_at)
values (
  'whatsapp',
  'signin_code',
  null,
  'Meta escribe este mensaje. Manda un código de 6 dígitos con un botón para copiarlo, y no se puede editar: así funcionan las plantillas de autenticación. La plantilla aprobada se llama codigo_acceso.',
  'es_MX',
  array['code'],
  'approved',
  now()
)
on conflict (channel, key) do update
  set wa_status = 'approved', wa_synced_at = now(), wa_error = null;
