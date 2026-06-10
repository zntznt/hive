# 08 — Brand & Tone: Hive

**Decision (founder, jun 2026):** the app is named **Hive**. Bug-inspired, cozy — never camp. In the founder's words: *"just don't be ham fisted with theme, we need this to be first and foremost easy to use."* That sentence is the design constitution; everything below serves it.

## Naming rules (the guardrail)

- **Operational concepts keep universal names, always:** club, event, invitation, RSVP («Voy / No voy / Quizás»), confirmar, aportaciones, gastos, balances, encuestas, lista de espera, admin. A themed name that causes one misunderstanding costs more than all the charm it adds.
- **Theme lives where a misread costs nothing:** app name, logo, empty states, loading copy, success toasts, illustrations, easter-egg microcopy.
- The test for any themed term: *would a first-time, least-techy club member hesitate for even a second?* If yes, use the plain word.

## Visual identity

- **Mark:** Font Awesome `bugs` (classic solid) — the founder's pick, it sparks joy. Verify free-tier availability on [the icon page](https://fontawesome.com/icons/bugs) when implementing; `fa-bug` (singular) is the confirmed-[free](https://fontawesome.com/license/free) fallback. (Low-fi wireframes use Tabler `ti-bug` as a stand-in.)
- **Palette — honey & cream, used sparingly:** warm amber/honey for primary actions and active states (≈ `#EBA937` family), cream surfaces (≈ `#FBF7EF`), deep warm charcoal text (≈ `#2B2620`). Semantic colors (success/danger/info) stay conventional — money and errors are never themed.
- **Type:** humanist sans with soft, slightly rounded forms (candidates: Nunito Sans, Figtree, Asap); generous line-height; sentence case everywhere. Cozy comes from warmth + air, not from display fonts.
- **Motif:** the hexagon, subtly — avatar frames, empty-state illustrations, list bullets. Never wallpaper, never load-bearing for comprehension.
- **Motion:** small and soft; at most a dotted bee-path on loading states.

## Voice & copy

- Warm, brief, Spanish-first (EN twin). Friendly verbs, zero jargon.
- **Themed-copy budget: one wink per screen, maximum.** Examples (copy layer only):
  - Empty contributions list: «Nadie trae nada todavía — sé la primera abeja.»
  - Loading: «Zumbando…»
  - Event fully covered: «La colmena está lista.»
- Section labels stay literal («Actividad», not «El buzz»); flavor may appear in subtitles, never in nav.

## Where theme must never go

Navigation labels · buttons · money, balances and settle-up · confirmation dialogs · error messages · admin panel · WhatsApp/email notification templates (utility messages must be instantly, boringly clear).
