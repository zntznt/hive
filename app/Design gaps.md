# Design gaps

Where the built app deliberately differs from `The design, in full.md`, and why.

The standard is that the app matches the design. Where the build should win, that is fine, but it
gets an argued entry here, because a silent difference cannot be told from a mistake by the next
person to read either one.

Written during the UI/UX conformance pass against `Implementation review 2.md`. Everything in that
document is either fixed or listed below.

---

## 1 · The club card keeps its cover photo, cropped, not a honeycomb field (C3)

The design's club card opens with a honeycomb field on cream fading through a gradient into the
card, so the hexagon mark dissolves out of a texture rather than sitting on a seam. The review
offered two acceptable fixes: keep the cover photo but lay the same cream gradient over its bottom
third, or drop the cover here entirely.

The build does neither. It renders the club's cover photo crisp, at a fixed 5:2, with the mark
straddling a hard edge, and falls back to the honeycomb field only when there is no cover.

The reason is that the gradient was built, shipped, and taken back out. A real photograph read
through a cream gradient does not dissolve, it goes muddy: the founder's first upload was a table of
board games and the bottom third of it turned beige. The gradient is invisible over the flat
honeycomb the design was drawn against, and ruinous over the photographs members actually upload,
which is the only thing this surface will ever hold once a club has been going a month.

The mark still emerges rather than overlaps, which was the point of the gradient. It straddles the
photo's bottom edge inside a paper-coloured hexagon frame, so there is a deliberate boundary instead
of a smudged one.

The sizing note in the same finding **was** taken: the frame is 56x62 around a 50px avatar, name at
19px, as drawn.

## 2 · The confirmation deadline reminds, it does not resolve (F3)

The design says that at the deadline maybes are dropped, the waitlist moves up to fill their spots,
and everyone gets the final headcount. The app sends a reminder to whoever has not answered, and the
copy says exactly that and nothing more.

The review already called the copy the correct call, and it is: never promise behaviour that does
not exist. This entry is here so the kit stops specifying the other behaviour as though it shipped.

Recorded as a product decision, not a copy fix. Building drop-and-promote means deciding what
happens to somebody who is dropped and then wants back in, whether the promoted person is told they
are in or merely stops being on a list, and what an organizer sees the morning after. None of that
is written down yet, and a half-built version that silently removes people from an event is worse
than a reminder.

## 3 · The roster shows an attendance stat (carried over)

Kept from the previous pass. The club roster row carries an attendance figure the design does not
have. It survives because it is the one number that answers "is this person actually part of this
club", which is the question a roster is opened to answer.

## 4 · `EmptyState`'s default icon (carried over)

Kept from the previous pass. The design's default is `jar`; the build's default is per-caller with
`jar` as the fallback, so a section that has a better glyph uses it.

---

# Not gaps: things the review flagged that the code already had

## The waitlist checkbox is not under the hit-target floor (F2)

The review reads the inline `<Checkbox>` in the capacity block as "well under 44px". The visual box
is 17px, but `Checkbox` wraps it in a `<label class="tap">`, and `.tap` is `min-height: 44px`. The
target is already the full 44 and has been; only the visual is 17, which is what the design asks
for ("wrap the visual in a 44px button rather than growing the visual").

The missing half of that finding was real and is fixed: the block now carries its hint, *"Sin cupo
el evento nunca se llena, y nadie espera."*

---

## 5 · English shipped, and what it cost to get there

Resolved. The entry that used to sit here recorded English as built but held
back, because the table covered the shell and not the screens and an English
phone would have got a translated tab bar over Spanish rows. The table is
finished now: 727 keys in both languages, balanced, and `COMPLETE_LANGS` lists
both, so the picker offers both and the resolution can reach either.

Two things worth keeping from the work.

**The derived-data functions had to take the language.** `whenPill`,
`attendanceLine`, `quietSince`, `timeAgo` and the five date formatters all
produced Spanish and were called from both sides of the app, so each grew a
`lang` parameter defaulting to Spanish. Defaulting matters: a caller that has
not been given a language gets the app's own language rather than a key or an
empty string. `whenPill` also moved out of `WhenPill.tsx` into `lib/when.ts`,
because making the component a client component made the function unreachable
from the server components that call it.

**The timezone is not the language.** The date formatters take a locale now
and keep `America/Mexico_City` regardless. An event at 8pm is at 8pm in Mexico
City for a reader in London too, and shifting it to their clock would tell them
the wrong hour to turn up. Only the words follow the language.

Four module-level `const` maps held copy: the RSVP answers, the outbox status
labels, the WhatsApp template states, and the club change-request kinds. Every
one of them is trap three from §7 in its purest form, and all four now hold
keys resolved at render.

---

# Fixed here: the migrations could not build a working database

Worth recording, because it was invisible for a long time and `sandbox:reset` is
the only thing that could have found it.

A database built from `supabase/migrations` gave `anon` and `authenticated` no
SELECT, INSERT, UPDATE or DELETE on any table in `public`. Every table has RLS
and a working policy and none of it was ever reached: Postgres refused at the
privilege layer first. Signing in worked, the first query returned "permission
denied for table users", the gate read a null profile, and the person landed back
on the sign-in screen they had just used.

Production never had it. Its tables were created through Supabase's own API,
where a default privilege grants those roles everything new in `public`;
replaying the same files as `postgres` locally does not. Migration 0052 grants
what production already reports, so it is a no-op there and a repair everywhere
else, and it sets the default privilege so the next table does not have to
remember.

`signin_throttle` is deliberately kept off both roles, matching production: it
records failed attempts per address, so reading it enumerates who has an account.

---

# The verification harness, and a correction

An earlier version of this file said `scripts/shoot.mjs` could not screenshot a
signed-in page, and that the fault was pre-existing because unmodified `main`
behaved the same. The second half was true and the conclusion was wrong: both
runs were built the same wrong way, so the comparison proved nothing.

There were two real faults, neither of them in the app's UI.

**The database had no grants.** Recorded above; migration 0052 fixes it.

**The server under test was talking to production.** `NEXT_PUBLIC_*` is inlined
at build time, so `next build` followed by `next start` with the sandbox env
gives a server that ignores it: the bundle already has the production Supabase
URL baked in. `npm run sandbox:app` builds *and* serves with the env, which is
why it is one script and not two. Building by hand was my own error and it cost
most of a session.

Both failures ended the same way, at a perfectly rendered sign-in screen, which
is the worst shape a harness fault can take: it looks like an answer. So
`shoot.mjs` now checks for both before it takes a picture. It reads the signed-in
member's own profile and says to run `sandbox:reset` if the database will not
answer; it compares the Supabase host baked into the served page against the one
in `.env.sandbox` and says to use `sandbox:app` if they differ; and if a gated
route still lands on `/`, it says so and exits non-zero rather than writing a png
of the door.

`shoot.mjs` works. Every screen in this pass was checked against its reference
with it.
