-- Recognising a browser by what it is called.
--
-- `push_subscriptions` has an endpoint, which is the real identity of a
-- subscription, and a device_label, which is a sentence for a person to read:
-- "Chrome en este equipo". The account screen needs a third thing neither of
-- them provides, which is "is this row this browser?", and it was answering it
-- by comparing the label.
--
-- A label is display copy. It is written in whatever language the member's
-- browser was in when they subscribed, so somebody who had since switched to
-- English saw their own machine listed twice, once as "Chrome en este equipo"
-- and once as "Chrome on this device", with opposite answers next to them. The
-- endpoint cannot stand in: it is null until a live subscription resolves, and
-- there is none at all when permission is blocked, which is exactly when a
-- stale row for that browser is still sitting here.
--
-- So the key gets a column. `chrome|linux`, from the same user agent read the
-- label is built from, untranslated and not shown to anybody.
--
-- Existing rows keep a null key and are still matched by name, which is the
-- workaround this replaces. They age out on their own: a subscription is
-- rewritten every time the browser re-registers, and that write now carries
-- the key.

alter table public.push_subscriptions
  add column if not exists device_key text;

comment on column public.push_subscriptions.device_key is
  'Language independent id for the browser, from its user agent. device_label is the same fact written for a person to read, and must never be compared.';
