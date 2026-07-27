-- 0015: reword the sign-in link, and record why it cannot be a UTILITY
-- template no matter how it is worded.
--
-- The old body greeted the member by name and named the product, which reads
-- promotional. This one drops both and states that the recipient asked for
-- it, which is the signal Meta uses to tell utility from marketing. wa_vars
-- follows the body down to a single variable.
--
-- Meta rejected the reworded template as UTILITY within seconds, with
-- INCORRECT_CATEGORY. The wording was never the problem. Meta keeps a
-- separate AUTHENTICATION category for signing in, and it accepts only
-- one-time codes with copy-code buttons, not links. A magic link is
-- therefore marketing in their taxonomy however transactional it reads,
-- which for a login message is a real cost: marketing templates are subject
-- to per-user limits and can be muted, and a member who mutes them can no
-- longer sign in this way.
--
-- Getting AUTHENTICATION would mean sending a six digit code and verifying
-- it, rather than a tappable link. That is a product decision, not a
-- rewording, so it is not made here.
--
-- wa_status returns to null: the template no longer exists at Meta, so the
-- app must refuse to send it and point people at their correo. sendWhatsapp
-- and the magic-link path both check approval before sending.

update public.notification_templates set
  body = 'Solicitaste un enlace para entrar a tu cuenta. Ábrelo aquí: {{link}} Es de un solo uso y vence en una hora. Si no lo solicitaste, ignora este mensaje.',
  wa_vars = array['link'],
  wa_status = null,
  wa_synced_at = now(),
  wa_error = 'Meta rechazó UTILITY con INCORRECT_CATEGORY; el nombre quedó bloqueado tras borrarlo. Reenviar cuando se libere.'
where channel = 'whatsapp' and key = 'magic_link';
