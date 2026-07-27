-- 0013: make every WhatsApp template sendable.
--
-- Eight of them declared wa_vars as an empty array while their bodies carried
-- placeholders. wa_vars is what the sender turns into positional parameters,
-- so each of these would have reached Meta with zero variables against a
-- template expecting several, and come back as "Template parameter count
-- mismatch". That is the same failure that made every WhatsApp notification
-- fail silently until it was traced through the per-recipient endpoint. These
-- were simply not sent often enough to surface it yet.
--
-- The bodies also break rules Meta already enforced on the templates it
-- reviewed: no placeholder at the very start or the very end, and enough
-- fixed text around the placeholders. Several opened with a bee emoji, which
-- is both a rejection risk and no longer the brand mark.
--
-- {{name}} is injected by the dispatcher from the recipient's display name.
-- The invitation template deliberately avoids it: an invitee has no account
-- yet, so there is no name to inject.

update public.notification_templates set
  body = 'Hola, {{pending_user}} acaba de registrarse en Hive y está esperando aprobación. Entra al panel de administración para revisar la cuenta.',
  wa_vars = array['pending_user']
where channel = 'whatsapp' and key = 'admin_pending_user';

update public.notification_templates set
  body = 'Hola {{name}}, tu propuesta en {{club}} se aprobó: {{summary}}. Gracias por proponerla.',
  wa_vars = array['name', 'club', 'summary']
where channel = 'whatsapp' and key = 'change_request_approved';

update public.notification_templates set
  body = 'Hola {{name}}, tu propuesta en {{club}} no se aprobó: {{summary}}. Puedes proponer otra cuando quieras.',
  wa_vars = array['name', 'club', 'summary']
where channel = 'whatsapp' and key = 'change_request_declined';

update public.notification_templates set
  body = 'Hola {{name}}, se canceló "{{event}}". Si había saldos pendientes, siguen en pie hasta que se liquiden.',
  wa_vars = array['name', 'event']
where channel = 'whatsapp' and key = 'event_cancelled';

update public.notification_templates set
  body = 'Hola, {{inviter}} te invita a {{title}} en Hive. Entra con este enlace para ver los detalles y confirmar: {{link}} Te esperamos.',
  wa_vars = array['inviter', 'title', 'link']
where channel = 'whatsapp' and key = 'invitation';

update public.notification_templates set
  body = 'Hola {{name}}, ya eres parte de {{club}}. Aquí puedes ver lo que viene: {{link}} ¡Nos vemos pronto!',
  wa_vars = array['name', 'club', 'link']
where channel = 'whatsapp' and key = 'join_request_approved';

update public.notification_templates set
  body = 'Hola {{name}}, tu solicitud para unirte a {{club}} no se aprobó por ahora. Si crees que es un error, habla con quien organiza.',
  wa_vars = array['name', 'club']
where channel = 'whatsapp' and key = 'join_request_declined';

update public.notification_templates set
  body = 'Hola {{name}}, {{to}} confirmó tu pago de {{amount}} de "{{event}}". Ese saldo queda liquidado.',
  wa_vars = array['name', 'to', 'amount', 'event']
where channel = 'whatsapp' and key = 'payment_confirmed';

update public.notification_templates set
  body = 'Hola {{name}}, {{from}} dice que te pagó {{amount}} de "{{event}}". Puedes confirmarlo aquí: {{link}} Gracias.',
  wa_vars = array['name', 'from', 'amount', 'event', 'link']
where channel = 'whatsapp' and key = 'payment_received';

-- submitted to Meta during this session; the status was never written back
update public.notification_templates set
  wa_status = 'pending', wa_synced_at = now(), wa_error = null
where channel = 'whatsapp' and key = 'rsvp_pending' and wa_status is null;
