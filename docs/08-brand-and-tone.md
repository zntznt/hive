# 08 · Brand & Tone: Hive

**Decision (founder, jun 2026):** the app is named **Hive**. Bug-inspired, cozy, never camp. In the founder's words: *"just don't be ham fisted with theme, we need this to be first and foremost easy to use."* That sentence is the design constitution; everything below serves it.

## Naming rules (the guardrail)

- **Operational concepts keep universal names, always:** club, event, invitation, RSVP («Voy / No voy / Quizás»), confirmar, aportaciones, gastos, balances, encuestas, lista de espera, admin. A themed name that causes one misunderstanding costs more than all the charm it adds.
- **Theme lives where a misread costs nothing:** app name, logo, empty states, loading copy, success toasts, illustrations, easter-egg microcopy.
- The test for any themed term: *would a first-time, least-techy club member hesitate for even a second?* If yes, use the plain word.

## Visual identity

- **Mark (final, ago 2026):** a hexagonal cell holding three members. It is the same shape every member avatar wears and the same idea the product is about: a few people, contained. It replaces the Font Awesome `bugs` glyph, which was always a placeholder. Source of truth is `app/assets/brand/hive-mark.svg`: one path with `fill-rule="evenodd"`, so the ring, the field and the dots come out of a single silhouette and recolouring is one attribute. That attribute is `currentColor`, so there is one file and not one per colour. There used to be a `hive-mark-cream.svg` as well, identical in all but six characters. It sits outside `public/` because nothing loads it over HTTP: `BrandMark` inlines the path, so these are vector source for whoever redraws the mark, not served assets.
  - **No plate.** Charcoal on light, cream on dark, straight on the page. A hexagon inside a rounded honey square is two containers for one shape. Honey stays the accent (*this wants your attention*), not the identity. The one exception is an app icon, where the mark has to survive a home screen it does not control: those are the tiles in `app/public/assets/pwa/`.
  - **Two cuts.** The full mark at 32px and up; `hive-mark-small.svg`, the silhouette, below that, because three dots inside a ring need about four distinguishable bands across the width and 16 pixels does not have them. `BrandMark` picks the cut from the height it is drawn at, so no screen can ask for the one that will not read.
  - **The path, the viewBox and the 0.866 ratio are one fact.** The path is cropped to the viewBox, so a new path under a stale viewBox clips about a third of the hexagon and does not throw. They are stated together at the top of `BrandMark.tsx` and nowhere else.
  - **Install tiles are regenerated, never resized.** From `ui_kits/hive-app/pwa-icons.html` in the design kit, where each tile states the mark's share of its box as a number: 72% for a full-mark tile, 84% for a silhouette one, 52% for the maskable tile alone, which is low enough that the whole mark sits inside the centre 60% Android keeps. `badge-72.png` ships at 72 and takes the silhouette, because Android tints it and draws it near 24: judge a tile by the size it is displayed at, not the size it ships at.
  - **Never:** the mark on a honey tile in the UI · the full mark below 32px · the wordmark re-typed in anything but Baloo 2 ExtraBold at `-.01em` · a stroke, gradient or shadow · the dots recoloured separately, they are holes in one path · a bee. Hive is not a honey brand; the cell is the metaphor, a container that tessellates.
- **`fa-bug` (singular) is a member avatar, not the brand.** The bugs are people, the hexagon is what holds them. A new member is dealt a bug at random rather than the first in the list, or everyone who never opens their account is the same orange bug and the avatars stop telling anyone apart, which is their only job.
- **Icons:** Font Awesome Free, inlined as raw path data in `app/src/components/ui/Icon.tsx`. No npm dependency, no font file, no CDN request, and only the glyphs actually used cost bytes. Icons inherit `currentColor`, so they take the palette of whatever they sit in. Icons are [CC BY 4.0](https://fontawesome.com/license/free). Emoji are reserved for club-authored content (category glyphs), never for app chrome, because the OS draws them differently on each phone.
- **Palette · honey & cream, used sparingly:** warm amber/honey for primary actions and active states (≈ `#EBA937` family), cream surfaces (≈ `#FBF7EF`), deep warm charcoal text (≈ `#2B2620`). Semantic colors (success/danger/info) stay conventional: money and errors are never themed.
- **Type (final):** two faces, and the pairing is the point. **Nunito Sans** is the body: a humanist sans with soft, slightly rounded forms, generous line-height, sentence case everywhere. **Baloo 2** is `--font-display`, and it takes the headings, the wordmark and the avatar initials, at four weights. Baloo is a display face, deliberately: cozy in the body comes from warmth and air, but a heading set in the body face makes a page read as a form, and this app is a place people meet. Display type is where the theme is allowed, one of the surfaces the naming rules already list. It is not allowed in a label, a button or an amount, which is what "not from display fonts" was reaching for and said too widely. Figtree and Asap were candidates and neither shipped.
- **Motif:** the hexagon, subtly: avatar frames, empty-state illustrations, list bullets. Never wallpaper, never load-bearing for comprehension.
- **Motion:** small and soft, and there is exactly one piece of it. `BeeLoader` is the mark under a quiet opacity pulse, and it means "the thing you just did is running", never "this screen is on its way" (that is `Skeleton`, deliberately still). It does not rotate: a spinning hexagon reads as somebody else's loading spinner, and the mark is a container, not a wheel. `prefers-reduced-motion` stills it.

## Voice & copy

- Warm, brief, Spanish-first (EN twin). Friendly verbs, zero jargon.
- **Themed-copy budget: one wink per screen, maximum.** Examples (copy layer only):
  - Empty contributions list: «Nadie trae nada todavía. Sé la primera abeja.»
  - Loading: «Zumbando…»
  - Event fully covered: «La colmena está lista.»
- Section labels stay literal («Actividad», not «El buzz»); flavor may appear in subtitles, never in nav.

## Where theme must never go

Navigation labels · buttons · money, balances and settle-up · confirmation dialogs · error messages · admin panel · WhatsApp/email notification templates (utility messages must be instantly, boringly clear).
