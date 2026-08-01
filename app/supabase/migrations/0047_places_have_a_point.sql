-- A place is a point, not a sentence.
--
-- Both saved_places and events stored only text, and every map on the screen
-- was a keyless Google embed built by handing that text back as ?q=. So the
-- map showed wherever Google decided the string meant, the "Cómo llegar" link
-- re-guessed it independently, and there was no way for anybody to correct
-- either: no pin to drag, and nowhere to put the answer if there had been.
--
-- These two columns are that answer. When they are set, the pin is the place:
-- the preview centres on it, directions route to it, and the text alongside
-- goes back to being a label for humans rather than a query string.
--
-- Nullable on purpose. Every place that already exists has no point, and
-- guessing one for them server-side would be inventing data. They keep
-- working off the text until somebody opens them and drops the pin.

alter table saved_places add column lat double precision;
alter table saved_places add column lng double precision;

alter table events add column lat double precision;
alter table events add column lng double precision;

-- Latitude and longitude, or neither. A row with one of the two is a bug that
-- would put a pin on the equator or the prime meridian.
alter table saved_places add constraint saved_places_point_complete
  check ((lat is null) = (lng is null));
alter table events add constraint events_point_complete
  check ((lat is null) = (lng is null));

comment on column saved_places.lat is 'Pin the member dropped. When set, this is the place: previews centre here and directions route here.';
comment on column events.lat is 'Pin the organizer dropped. When set, this is the place: previews centre here and directions route here.';
