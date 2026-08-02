-- The app follows the phone, unless you say otherwise.
--
-- Null is the default and it means "follow the phone": the server reads
-- Accept-Language, the browser reads navigator.language, and both land on the
-- same answer. A value here is an explicit override set in Tú, and it wins
-- everywhere because a person who went and chose Spanish on an English handset
-- meant it.
--
-- Only the two languages the app is actually written in. The fallback is
-- whole-language and never per-string: an Italian phone gets English, not an
-- Italian shell with Spanish rows in it, and a third value here would promise
-- a translation that does not exist.

alter table public.users add column if not exists lang text
  check (lang is null or lang in ('es','en'));

comment on column public.users.lang is
  'Explicit language override set in Tú. Null means follow the phone, which is the default and what most people should stay on.';
