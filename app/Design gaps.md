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

# Known defect in the verification harness, not in the app

`scripts/shoot.mjs` cannot currently screenshot any signed-in page in this container. It signs in
over the API, hands the browser the session cookie, and the first render is correct: the server
returns 200 for `/account` as an active admin and the HTML is the right page. Within about a tenth
of a second of hydration the app performs a full navigation to `/` and lands on sign-in.

It is not caused by this pass. With every change on this branch stashed, unmodified `main` bounces
identically on the same server. It is not the middleware's session refresh either: disabling that
refresh entirely changes nothing. There are no console errors, no page errors, no failed requests
and no calls to `/auth/v1/*` in the window where it happens, so it is not a token being rejected.

What still works, and what this pass was verified with instead:

- `npm run sandbox:reset` builds the database from `supabase/migrations` from scratch, which is the
  only real check that the three new migrations here compose with the other forty-eight.
- A server-side fetch carrying a real session returns 200 on `/`, `/account`, `/clubs` and
  `/events`.
- Typecheck, lint and a production build.

This wants fixing before the next visual pass, because step 2 of the design's own "how to check your
work" is to point `shoot.mjs` at the eleven screens and compare them to the reference captures, and
right now that step cannot run.
