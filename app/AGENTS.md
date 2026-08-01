<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tone and language

- This app ships in Mexico. All user-facing copy is Mexican Spanish: natural, warm, "tú". Prefer "correo" over "email", "miembros" over "socios". Money is pesos (MXN, `$`). Phone hints use `+52`.
- No em dashes (`—`). Anywhere. Not in UI copy, not in code comments, not in commit messages, not in docs. Use a period, comma, parenthesis, or `·` instead. This is a hard rule.
- Keep operational words literal (evento, gasto, encuesta, invitación). Theme/flavor only in empty states and microcopy, never in nav, buttons, money, or errors.

# Look at the screen before you ship it

There is a whole Hive on this machine. Use it. Deploying to see what a change looks like makes
whoever opens the app the test harness, and every defect that survived a review here was one a
rendered page shows in a second: an input the same colour as its background, a banner fading to
mud, a map whose stylesheet never loaded, a cover cropped to a stripe. A type checker cannot see
any of those and neither can a diff.

```
npm run sandbox:up      # postgres, auth, rest and storage, in docker
npm run sandbox:seed    # demo club, and passwords so a browser can sign in
npm run sandbox:app     # build and serve the app against it, on :3100
npm run shoot -- /club/los-jueves --as marta
```

`shoot` signs in as any seeded account, opens a route, writes a png to `.sandbox-shots/` and prints
the page's visible text plus any console errors. `--as jorge` for a plain member, `--as ana` for an
account still pending, `--width 1024` for a desktop. Sign-in goes over the API rather than through
the form, because the form wants a six digit code out of a mailbox.

Nothing in the sandbox touches a deployed project. `.env.sandbox` holds the fixed local demo keys
that `supabase start` prints on every machine; real credentials stay in `.env.local`.

`sandbox:app` builds and serves rather than running `next dev`, and that matters. **`next dev` in
this container renders correct HTML and then never hydrates**: React loads, the flight runtime
loads, nothing throws, and no client component ever mounts. Every effect is dead and every button
is a decoration. A shot taken against it is honest about layout and copy and silently wrong about
anything you would click, which is the worst kind of harness, one that looks like it is checking.
A production build hydrates here, and it is also what ships, so that is what `shoot` points at.

`npm run dev:sandbox` still exists for iterating on markup with hot reload. Do not conclude
anything about behaviour from it. It is how "the push row renders as an empty card" and "the RSVP
button does nothing" got written down as defects; both were the harness, and both were fine.

`npm run sandbox:reset` rebuilds the database from `supabase/migrations` and is the only check that
they can still build one. They could not, twice: a migration used an enum value in the transaction
that added it, and another read a column that a later migration creates. Both had worked on
production because production was built by applying them as they were written, which is not the
same thing.

# One fact, one function

If two screens can show the same fact, exactly one function decides it. Before writing a formatter,
a count, or an "is it today" check, grep for the one that already exists.

This is the failure this codebase keeps repeating, and it is never caught by types or tests, because
both copies work. It is caught by a person noticing two screens disagree:

- `Desde las 20:00` on the event page while the Clubs tab said `20:00 a 23:00`, for the same event.
- Two `FaceStack` components with different overflow maths, so five people rendered `+2` on one
  screen and `+7` on another.
- "Is it today?" decided by string-matching the Spanish label `'Hoy'` out of `WhenPill`, so renaming
  or translating that copy would silently switch off the entire day-of layout, with no error.
- `van N` printed twice on one page, 120px apart, from two different expressions.

Corollaries:

- **Never branch on display copy.** A label is for reading. If logic needs to know something, it
  needs a function that returns a boolean, not a string comparison against words a translator owns.
- **Time is a span, never a start.** `fmtSpan` exists. Only a row too narrow for a range may fall
  back to the start, and it says "desde" when it does.
- The derived-data layer lives in `lib/`: `time.ts` for the clock and the calendar, `club-card.ts`
  for what a club is doing next, `event-line.ts` for who is coming, `plate.ts` for what is owed.
