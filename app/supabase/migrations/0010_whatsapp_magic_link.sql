-- 0010: sign in over WhatsApp.
--
-- Members arrive from a WhatsApp group, so asking them to go find an email to
-- get in is the wrong first step. Supabase can only send a magic link over
-- email itself, and its phone channel sends a numeric code through Twilio,
-- which would mean a second WhatsApp provider next to Zernio. Instead the app
-- generates the link server-side (auth.admin.generateLink, which returns the
-- URL without sending anything) and delivers it through the Zernio pipeline
-- that already carries every other message.
--
-- Only a whatsapp row exists: the email version of this link is sent by
-- Supabase itself and never touches notification_templates.
--
-- Body rules learned from the templates Meta already reviewed: no placeholder
-- at the very start or end, and enough fixed text around the placeholders.
insert into public.notification_templates (channel, key, subject, body, wa_language, wa_vars)
values (
  'whatsapp',
  'magic_link',
  null,
  'Hola {{name}}, este es tu enlace para entrar a Hive: {{link}} Sirve una sola vez y vence en una hora. Si no lo pediste, ignora este mensaje.',
  'es_MX',
  array['name', 'link']
)
on conflict (channel, key) do nothing;

-- Throttling reads the outbox for recent magic_link rows per user, and the
-- admin panel reads it by status. Both want the same lookup.
create index if not exists notification_outbox_user_template_created_idx
  on public.notification_outbox (user_id, template, created_at desc);
