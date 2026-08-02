# 01 · Competitive Scan

*Scanned June 2026. Purpose: confirm the gap this app fills, and steal the best UX ideas from each neighbor.*

## Coverage matrix

| Capability | crab.fit | When2meet | Rallly | Doodle | Whocan | Partiful | Spond | Kittysplit | Splitwise |
|---|---|---|---|---|---|---|---|---|---|
| Availability grid (paint + heatmap) | ✅ | ✅ | ➖ (slot votes) | ➖ (slot votes) | ➖ (poll matrix) | ➖ (date poll) | ❌ | ❌ | ❌ |
| RSVP / confirmations | ❌ | ❌ | ➖ | ➖ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Capacity + waitlist | ❌ | ❌ | ❌ | ❌ | ➖ (booking limits) | ✅ | ✅ | ❌ | ❌ |
| Bring list / potluck | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Tasks / todos | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ➖ (volunteer roles) | ❌ | ❌ |
| Cost **splitting** (peer↔peer) | ❌ | ❌ | ❌ | ❌ | ❌ | ➖ (collect via Venmo links) | ➖ (organizer collects fees) | ✅ | ✅ |
| Decision polls | ❌ | ❌ | ➖ (scheduling only) | ➖ | ✅ | ➖ (date poll) | ➖ | ❌ | ❌ |
| +1 guests | ❌ | ❌ | ❌ | ❌ | ➖ | ✅ | ✅ | ➖ (just names) | ❌ |
| Club entity: history, roster, attendance | ❌ | ❌ | ❌ | ❌ | ❌ | ➖ (past events) | ✅ | ❌ | ➖ (groups, money only) |
| Recurring events | ❌ | ❌ | ❌ | ➖ | ✅ (recurring slots) | ❌ | ✅ | ❌ | n/a |
| No-registration participation | ✅ | ✅ | ✅ | ➖ | ✅ | ➖ (phone required) | ❌ (account + app) | ✅ | ❌ |
| WhatsApp-native notifications | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (US SMS) | ❌ (in-app push) | ❌ | ❌ |

✅ = first-class ➖ = partial/adjacent ❌ = absent

## Per-tool notes

### crab.fit · the UX north star for scheduling
Free, open source, no accounts: create event → share link → participants paint availability → live heatmap, timezone-correct. Events auto-delete after 3 months of inactivity; optional name+password per event. **Steal:** the paint-grid interaction, live heatmap, timezone normalization, the "create in 10 seconds" landing page. **Misses:** everything after the time is chosen (RSVP, items, money, polls), by design.

### When2meet
Same grid idea, older and barebones. Validates that the grid is the right primitive; nothing else to take.

### Rallly · open-source scheduling polls
No-login participation, anonymous voting option, comments, real-time updates; built on Next.js + Postgres (same family as our stack). Free tier auto-deletes inactive polls; Pro $7/mo for persistence + calendar invites. **Steal:** the *secret admin link* pattern (organizer powers without an account), finalize-and-notify flow. **Misses:** slot-vote model instead of paint grid; no event lifecycle beyond picking a time.

### Doodle
The incumbent. Slot polls, heavy account/ads pressure, business-oriented pricing. Mostly a cautionary tale: monetization friction is exactly what made the user's groups bounce to crab.fit.

### Whocan · closest in spirit
Free, no registration, nine poll templates: scheduling (incl. recurring slots), invitations/RSVP with catering preferences, **potluck bring lists**, **task assignment with deadlines**, group orders, booking with participant limits. **Misses:** templates are disconnected polls, not one integrated event object; no cost splitting; reportedly weak notifications; no "maybe" in scheduling; no club memory (attendance, history). **Lesson:** assembling our event from à-la-carte polls is the failure mode to avoid. Integration *is* the product.

### Partiful · closest in social polish
Free, animated invite pages, RSVP with social guest list, **Text Blasts** (one-way host → confirmed guests), automatic reminders, date polling, capacity + automatic waitlists, payment *collection* via Venmo/PayPal links, photo albums, co-hosts. **Misses:** US/SMS-centric (their groups live on WhatsApp), phone number required, no availability grid, no bring lists/tasks, collection ≠ *splitting* (no who-owes-whom ledger), no club attendance history. **Steal:** Text Blast (our WhatsApp nudge), the social-proof guest list, capacity/waitlist mechanics.

### Spond · closest in structure
Free club management: groups/subgroups, events with one-tap RSVP, **attendance tracking with exports**, volunteer roles, in-app messaging, organizer payment collection. **Misses:** requires accounts + app install for everyone (the adoption killer for casual clubs), sports-skewed, no paint-grid scheduling, no peer-to-peer expense splitting, notifications are in-app push (another app to check, vs. the WhatsApp group everyone already reads). **Steal:** attendance as a first-class club stat; recurring event handling. (Heja is the same shape, narrower.)

### Kittysplit · proof that money works without accounts
Create a "kitty" → secret link → add expenses (who paid, for whom) → instant balances + simplest settle-up transfers. No registration, no limits. **Steal:** secret-link trust model for money among friends, minimal expense entry (payer, amount, for-whom), settle-up suggestions. **Misses:** money only, no event around it.

### Splitwise · the ledger ceiling
Accounts required; groups with running balances, debt simplification, multi-currency. This is where our *later* cross-event club ledger points; v0 deliberately stops at per-event Kittysplit-grade simplicity.

## The gap (why this app should exist)

Every tool above owns one slice. A real recurring social event needs, in one place: **find the time (crab.fit) → confirm who's in (Partiful/Spond) → decide details (polls) → assign who brings what (Whocan) → split what it cost (Kittysplit), remembered across events by a club (Spond), and delivered where the group actually talks: WhatsApp (nobody).** The integration is the product; the club memory (categories, attendance, history) and WhatsApp-primary notifications are the moats vs. casual alternatives.

## Sources
- [crab.fit](https://crab.fit/) · [GitHub · GRA0007/crab.fit](https://github.com/GRA0007/crab.fit) · [Product Hunt](https://www.producthunt.com/products/crab-fit)
- [Rallly GitHub](https://github.com/lukevella/rallly) · [Rallly features (Elestio)](https://elest.io/open-source/rallly/resources/software-features)
- [Whocan](https://www.whocan.org/en/)
- [Partiful](https://partiful.com/) · [Partiful review (party.pro)](https://party.pro/partiful/) · [Partiful event settings help](https://help.partiful.com/hc/en-us/articles/28895223149979-What-features-are-available-to-change-in-my-Event-Settings)
- [Spond review 2026](https://instapv.co.uk/spond-app/) · [Spond on G2](https://www.g2.com/products/spond/reviews) · [Spond attendance tracking](https://www.spond.com/en-us/news-and-blog/attendance-tracking-on-spond/)
- [Kittysplit](https://www.kittysplit.com/en) · [Kittysplit help](https://www.kittysplit.com/en/help)
- [WhenAvailable group planning apps roundup](https://whenavailable.com/blog/best-group-planning-apps) · [RSVP/planning apps guide (Medium, Feb 2026)](https://medium.com/@noble.m/stop-herding-cats-the-ultimate-guide-to-event-rsvp-planning-and-ranking-apps-ba876749ae83)
