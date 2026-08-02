-- A place has a name and a street, and they do different jobs.
--
-- "Casa de Marta" is what the club calls it and what belongs on a card a week
-- out, when the question is whether you want to be there on a Thursday.
-- "Calle Colima 210, Roma Norte, CDMX" is what gets you there, and on the day
-- it is the only open question.
--
-- The where-card has had two states for this the whole time, and the day-of one
-- has been dead code: `area` was passed as null on every render, so the
-- charcoal header showed the venue name where the street belongs, which is the
-- one thing the person already knows.
--
-- It is filled by reverse-geocoding the pin on save rather than by asking for
-- a second field. The pin already exists, somebody already dragged it onto the
-- right door, and asking them to type the address underneath it is asking the
-- same question twice.
--
-- Nullable, because every place saved before today has no pin to geocode and
-- because the geocoder can be down. Where it is null the card falls back to
-- the name, which is what it did before.

alter table public.events add column if not exists area text;
alter table public.saved_places add column if not exists area text;

comment on column public.events.area is
  'The street line, reverse-geocoded from the pin: "Calle Colima 210, Roma Norte, CDMX". On the day this leads and the venue name drops beneath it, because at 19:50 the only open question is how to get there.';
comment on column public.saved_places.area is
  'The street line for this place, carried onto any event that reuses it.';
