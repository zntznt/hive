# 08 — Brand & Tone: Hive

**Decision (founder, jun 2026):** the app is named **Hive**. Bug-inspired, cozy — never camp. In the founder's words: *"just don't be ham fisted with theme, we need this to be first and foremost easy to use."* That sentence is the design constitution; everything below serves it.

## Naming rules (the guardrail)

- **Operational concepts keep universal names, always:** club, event, invitation, RSVP («Voy / No voy / Quizás»), confirmar, aportaciones, gastos, balances, encuestas, lista de espera, admin. A themed name that causes one misunderstanding costs more than all the charm it adds.
- **Theme lives where a misread costs nothing:** app name, logo, empty states, loading copy, success toasts, illustrations, easter-egg microcopy.
- The test for any themed term: *would a first-time, least-techy club member hesitate for even a second?* If yes, use the plain word.

## Visual identity

- **Mark:** Font Awesome `bugs` (classic solid), the founder's pick, it sparks joy. Confirmed present in Font Awesome Free 6.7.2, so the `fa-bug` (singular) fallback is not needed. (Low-fi wireframes use Tabler `ti-bug` as a stand-in.)
- **Icons:** Font Awesome Free, inlined as raw path data in `app/src/components/ui/Icon.tsx`. No npm dependency, no font file, no CDN request, and only the glyphs actually used cost bytes. Icons inherit `currentColor`, so they take the palette of whatever they sit in. Icons are [CC BY 4.0](https://fontawesome.com/license/free). Emoji are reserved for club-authored content (category glyphs), never for app chrome, because the OS draws them differently on each phone.
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
