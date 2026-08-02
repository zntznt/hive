# 02 · Product Brief

## Problem

Organizing a recurring social event today means juggling five tools and a noisy WhatsApp thread: crab.fit for the time, a chat poll for decisions, someone's memory for who brings what, a spreadsheet or Kittysplit for money, and "¿quién viene al final?" repeated until the organizer gives up. The coordination overhead lands on one person, every single time, and nothing is remembered between events.

No existing product integrates the full loop (see [01-competitive-scan.md](01-competitive-scan.md)): **time-finding → sign-up/confirmation → decisions → contributions → cost settling**, organized under a club that remembers its members and their attendance, with notifications delivered where the group actually lives: **WhatsApp**.

## First users

The founder's own clubs: recurring board game nights, scrapbooking nights, wargaming nights, movie nights, plus one-off dinners and parties. Spanish-speaking, WhatsApp-first, mixed tech comfort. The app is **admin-gated** for now: the app admin verifies every account, so the user base stays exactly these trusted circles while the product hardens. Public self-serve signup is explicitly a later phase.

## Jobs to be done

1. **Organizer:** "Get 8–14 people to a confirmed plan without chasing anyone individually."
2. **Member:** "Tell them when I can make it, what I'll bring, and what I owe, in under two minutes, from the link in the group chat."
3. **Club:** "Remember who we are: which nights we run, who comes, who hasn't shown up since March."
4. **Treasurer-of-the-moment:** "I fronted the pizzas; make getting paid back not awkward."

## Principles

1. **Club-centric.** The club is the home: roster, event history by category, attendance stats (always derived from RSVPs, never hand-maintained).
2. **Invite-first onboarding.** Organizers invite emails / WhatsApp numbers; invitees land on a pre-created profile via personal magic link. Zero signup forms. Recovery = request a fresh link from any device.
3. **Chat-native.** Every event has a share link designed to be dropped in the WhatsApp group; notifications go out WhatsApp-first, email as redundancy.
4. **Admin-gated instance (for now).** The app admin has final say on who holds an active account (verification toggle, pending → active → disabled lifecycle).
5. **Audit over locks.** Anyone can see who changed what; trust is social, enforcement is light.
6. **Each feature steals from the best:** crab.fit's grid, Partiful's text blast + waitlist, Whocan's potluck list, Kittysplit's no-friction expenses, Spond's attendance memory.

## Success criteria (v0)

- **Zero-instruction onboarding:** a club member taps the link in the WhatsApp group and completes availability + RSVP in **< 2 minutes** without asking anything in the chat.
- The founder's club runs **one full real event** end-to-end on the app: scheduled via grid, confirmed roster, contributions covered, expenses settled, with no parallel spreadsheet.
- The organizer sends **zero individual chase messages** for that event.
- Club home answers "when did X last come to a board game night?" without anyone bookkeeping.

## Non-goals (v0)

- Public self-serve signup, discovery, or SEO surface: the instance is private and admin-verified.
- Native mobile apps (responsive web + share links; PWA later).
- Payment *processing* (we compute who-owes-whom; money moves via Bizum/cash/whatever).
- Cross-event running ledger (schema is ready; product ships per-event settle-up first).
- Calendar sync, RRULE recurrence engines, multi-language UI (ES/EN i18n is fast-follow).

## Name

**Decided: Hive.** Bug-inspired, cozy without being camp. Identity, palette, type, and the naming guardrails ("theme never touches operational concepts") live in [08-brand-and-tone.md](08-brand-and-tone.md).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| WhatsApp Business setup stalls (number, template approval) | Email channel ships day one; Twilio sandbox for dev; share-link flow works without any outbound notifications |
| Feature breadth swamps v0 | MVP cut in [06-roadmap.md](06-roadmap.md) is enforced by the requirements cross-check; anything not Must waits |
| Admin verification becomes a bottleneck | New-account notifications ping the app admin; verifying is one toggle from the panel |
| Money features erode trust if confusing | Kittysplit-grade simplicity: payer, amount, for-whom; balances always explainable; activity log on every money row |
