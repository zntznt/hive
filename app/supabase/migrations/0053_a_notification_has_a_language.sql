-- A notification has a language, and it is the reader's.
--
-- The app follows the phone now, so an English-speaking member gets an English
-- interface and, until this migration, a Spanish email about it. That is worse
-- than either language on its own: it reads as a system that half-noticed who
-- you are.
--
-- The template key is no longer unique by itself. A template is identified by
-- what it says (`key`), where it goes (`channel`) and who can read it
-- (`lang`), so all three are the primary key, and the outbox records which
-- language it actually sent rather than leaving it to be inferred later.
--
-- Existing rows are backfilled to 'es' and their text is untouched. Nothing
-- here rewrites a template that is already live.
--
-- WhatsApp is deliberately left Spanish-only. Every WhatsApp template has to be
-- submitted to Meta and approved before it can send, and that is an external
-- review with its own turnaround, so English WhatsApp is a separate piece of
-- work with a person in the loop. Until those exist, the lookup below falls
-- back to Spanish for that channel, which is a real message in the wrong
-- language rather than no message at all.

alter table public.notification_templates
  add column if not exists lang text not null default 'es'
  check (lang in ('es','en'));

-- The outbox keeps the language it sent in. It is a fact about the message,
-- not something to re-derive from the recipient's current preference: somebody
-- who switches to English next week did not retroactively get English mail.
alter table public.notification_outbox
  add column if not exists lang text not null default 'es';

alter table public.notification_outbox
  drop constraint if exists notification_outbox_template_fk;

alter table public.notification_templates
  drop constraint if exists notification_templates_pkey;

alter table public.notification_templates
  add primary key (channel, key, lang);

alter table public.notification_outbox
  add constraint notification_outbox_template_fk
  foreign key (channel, template, lang)
  references public.notification_templates (channel, key, lang);

-- The English side, for the two channels that do not need anybody's approval.
--
-- Written as a copy of the Spanish row with the text replaced, so every other
-- column (wa_vars, wa_language, and whatever gets added later) matches by
-- construction rather than by me remembering it. The {{variables}} are the
-- same names the sending code passes, including {{codigo}}, which is Spanish
-- and stays Spanish because renaming it would break the caller.
insert into public.notification_templates (channel, key, lang, subject, body, updated_at, updated_by, wa_status, wa_language, wa_vars, wa_synced_at, wa_error)
select t.channel, t.key, 'en', e.subject, e.body, now(), t.updated_by, t.wa_status, t.wa_language, t.wa_vars, t.wa_synced_at, t.wa_error
from public.notification_templates t
join (values
  ('email','admin_pending_user','Somebody is waiting for approval: {{pending_user}}','Hi {{name}}, {{pending_user}} has just signed up to Hive and is waiting for your approval in the admin panel.'),
  ('email','availability_pending','We still need your availability for {{event}}','Hi {{name}},

You have not marked when you can make "{{event}}" yet.

The date gets fixed once everybody has answered. Mark yours here: {{link}}

Thank you.'),
  ('email','change_request_approved','Your proposal was approved','Hi {{name}}, an admin of {{club}} approved your proposal ({{summary}}). It is applied.'),
  ('email','change_request_declined','Your proposal was not approved','Hi {{name}}, an admin of {{club}} did not approve your proposal ({{summary}}).'),
  ('email','event_cancelled','An event was cancelled','Hi {{name}}, {{event}} was cancelled. Anything still owed stays owed until it is settled.'),
  ('email','event_today','{{event}} is today','Hi {{name}}, today is the day. "{{event}}" starts at {{time}}. All the details are here: {{link}} See you there.'),
  ('email','invitation','You have been invited on Hive','{{inviter}} invites you to {{title}}. Go to {{link}} to see it and reply.'),
  ('email','join_request_approved','You are in the club','Hi {{name}}, you are now a member of {{club}}. Go to {{link}} to see what is coming up.'),
  ('email','join_request_declined','Your request was not approved','Hi {{name}}, your request to join {{club}} was not approved.'),
  ('email','new_event','New event: {{title}}','Hi {{name}}, {{creator}} created "{{title}}" in {{club}}. Go and mark when you can: {{link}}'),
  ('email','payment_confirmed','{{to}} confirmed your payment of {{amount}}','Hi {{name}}, {{to}} confirmed your payment of {{amount}} from "{{event}}". That one is settled.'),
  ('email','payment_received','{{from}} says they paid you {{amount}}','Hi {{name}}, {{from}} marked {{amount}} from "{{event}}" as paid. Check the receipt and confirm it: {{link}}'),
  ('email','rsvp_pending','We still need your answer for {{event}}','Hi {{name}},

You have not told us whether you are going to "{{event}}" on {{when}}.

Knowing helps decide the place and what to bring. Answer here: {{link}}

Thank you.'),
  ('email','signin_code','Your code to get into Hive: {{codigo}}','Your code is {{codigo}}. It expires in 10 minutes. If you did not ask for it, ignore this email.'),
  ('email','waitlist_promoted','You have a place','Hi {{name}}, a place opened up at {{event}} and you are in. Go to {{link}} for the details.'),
  ('push','admin_pending_user','Somebody is waiting for approval','{{pending_user}} signed up and is waiting to be let in.'),
  ('push','availability_pending','We need your availability','Mark when you can make "{{event}}".'),
  ('push','change_request_approved','Your proposal was approved','An admin of {{club}} approved your proposal.'),
  ('push','change_request_declined','Your proposal was not approved','An admin of {{club}} did not approve your proposal.'),
  ('push','event_cancelled','An event was cancelled','{{event}} was cancelled. Anything still owed stays owed.'),
  ('push','event_today','{{event}} is today','It starts at {{time}}.'),
  ('push','join_request_approved','You are in the club','You are now a member of {{club}}.'),
  ('push','join_request_declined','Your request was not approved','Your request to join {{club}} was not approved.'),
  ('push','new_event','New event: {{title}}','{{creator}} created "{{title}}" in {{club}}. Mark when you can.'),
  ('push','payment_confirmed','{{to}} confirmed your payment','{{amount}} from "{{event}}". You are square.'),
  ('push','payment_received','{{from}} says they paid you','{{amount}} from "{{event}}". Check it and confirm.'),
  ('push','rsvp_pending','We need your answer','Are you going to "{{event}}"? It is on {{when}}.'),
  ('push','waitlist_promoted','You have a place','A place opened up at {{event}} and you are in.')
) as e(channel, key, subject, body)
  on e.channel = t.channel::text and e.key = t.key
where t.lang = 'es'
on conflict (channel, key, lang) do nothing;

comment on column public.notification_templates.lang is
  'Which language this template is written in. A key is not unique on its own: the same notification exists once per language it has been translated into. WhatsApp is es-only until English templates clear Meta review.';

comment on column public.notification_outbox.lang is
  'The language this message was actually sent in, kept rather than re-derived: somebody who switches language later did not retroactively receive the new one.';
