<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tone and language

- This app ships in Mexico. All user-facing copy is Mexican Spanish: natural, warm, "tú". Prefer "correo" over "email", "miembros" over "socios". Money is pesos (MXN, `$`). Phone hints use `+52`.
- No em dashes (`—`). Anywhere. Not in UI copy, not in code comments, not in commit messages, not in docs. Use a period, comma, parenthesis, or `·` instead. This is a hard rule.
- Keep operational words literal (evento, gasto, encuesta, invitación). Theme/flavor only in empty states and microcopy, never in nav, buttons, money, or errors.

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
