// The Hive lockup: the mark, a hexagonal cell holding three members, and
// "Hive" in Baloo 2. It is the same shape every member avatar wears, and the
// same idea the product is about: a few people, contained. The bugs are
// people, the hexagon is what holds them.
//
// The mark goes straight on the page. It used to sit in a honey tile, which
// was right for a Font Awesome glyph (a bug needs a field behind it to read as
// a logo) and stopped being right the moment the mark became a hexagon: a
// hexagon inside a rounded honey square is two containers for one shape, and
// at header size the honey is most of what you see. Honey is the accent, not
// the identity. A plate belongs in exactly one place, an app icon, where the
// mark has to survive a home screen it does not control, and those are the
// PNGs in public/assets/pwa/, not this component.

// Copied verbatim from assets/brand/hive-mark.svg and hive-mark-small.svg.
// Those live outside public/ because nothing loads them over HTTP: this
// component inlines the path, since it needs currentColor and it needs to pick
// between the two cuts. They are vector source for whoever redraws the mark,
// the same call Design gaps.md made for head.html and the PWA readme.
//
// These four values are one fact and move together: the
// path is cropped to the viewBox and the ratio is the viewBox's own, so a new
// path under a stale viewBox clips about a third of the hexagon and does not
// throw. Regenerate the install tiles from the kit's pwa-icons.html, where
// each tile states the mark's share of its box as a number, never by resizing
// a PNG.
const VIEW_BOX = '0 0 292.7 338'
const RATIO = 0.866
const FULL =
  'M 145.9 0 C 147.5 0.1 276.4 76 290.8 84.4 C 291.3 104.4 290.8 126.7 290.8 146.8 L 290.8 253.6 L 205 303.8 C 185.6 315.1 166.1 326.9 146.7 337.9 C 146.2 338.1 145.9 338 145.4 337.7 C 138.8 333.9 132.1 330.1 125.5 326.2 L 87.1 303.8 L 35.5 273.5 C 24.3 266.9 12.7 260.3 1.7 253.6 L 1.7 84.5 C 18.8 74.1 37.4 63.6 54.7 53.5 L 145.9 0 z M 146 55.4 C 147.9 55.8 168.4 68.3 171.7 70.2 L 245 113.2 L 245 224.9 C 233.7 231.2 221.5 238.7 210.4 245.2 L 146.4 282.7 C 145.9 282.7 53.8 228.7 47.6 225 L 47.6 113.2 C 58.5 106.5 70.5 99.8 81.6 93.2 L 146 55.4 z M 144.3 76.1 C 166.8 75 186 92.4 187.1 114.9 C 188.2 137.5 170.8 156.6 148.3 157.7 C 125.7 158.8 106.6 141.5 105.5 118.9 C 104.4 96.4 121.8 77.2 144.3 76.1 z M 95.8 155.6 C 118.2 153.6 138 170.1 140 192.6 C 142 215 125.4 234.8 102.9 236.7 C 80.5 238.7 60.8 222.1 58.8 199.7 C 56.9 177.3 73.4 157.6 95.8 155.6 z M 189.8 155.6 C 212.3 153.7 231.9 170.5 233.7 192.9 C 235.5 215.3 218.8 235 196.3 236.7 C 173.9 238.5 154.4 221.8 152.6 199.4 C 150.8 177 167.4 157.4 189.8 155.6 z'
const SILHOUETTE =
  'M 145.9 0 C 147.5 0.1 276.4 76 290.8 84.4 C 291.3 104.4 290.8 126.7 290.8 146.8 L 290.8 253.6 L 205 303.8 C 185.6 315.1 166.1 326.9 146.7 337.9 C 146.2 338.1 145.9 338 145.4 337.7 C 138.8 333.9 132.1 330.1 125.5 326.2 L 87.1 303.8 L 35.5 273.5 C 24.3 266.9 12.7 260.3 1.7 253.6 L 1.7 84.5 C 18.8 74.1 37.4 63.6 54.7 53.5 L 145.9 0 z'

// Two cuts, not one mark squinted at. Three dots inside a ring need about four
// distinguishable bands across the width and 16 pixels does not have them, so
// below this the ring and the dots silt into a blob and the silhouette takes
// over. The height decides the cut here rather than at the call site, so no
// screen can ask for the one that will not read.
const FULL_MARK_FROM = 28

// The mark's height in px. `sm` is 32 rather than the kit's 28 so the smallest
// lockup still gets the full mark, which is what the kit's own screens draw.
const HEIGHTS = { sm: 28, md: 40, lg: 52 } as const
// The wordmark is a fixed map, not a ratio off the mark. The 0.74 it was
// derived from put sm at 24 against the kit's 20, and the threshold above was
// 32 so the smallest lockup could still show the full mark. The kit draws the
// full mark at 28, so the constraint the ratio existed to satisfy was never
// real, and both are the kit's numbers now.
const WORDMARK_PX = { sm: 20, md: 28, lg: 36 } as const

// The gap scales with the mark, and is tight on purpose: a mark and a wordmark
// are ONE object, so the space between them has to read as smaller than the
// space around them, and a fixed gap holds at small sizes and comes apart at
// large, which is exactly when a logo gets looked at hardest. The kit scales
// its gap the same way.
//
// The wordmark does not. It is a fixed map above, the kit's, and the ratio
// only survives for a caller passing a raw number, which the named scale does
// not cover.
const GAP = 0.14
const WORDMARK = 0.74

// Two colours, not one. On a dark surface the kit paints the mark honey and
// the word white; painting both cream left the logo on the sign-in card, the
// darkest and most-seen surface in the app, carrying no brand colour at all.
// `ink` and `inherit` are genuinely one colour for both, so they say so twice
// rather than growing a special case.
const FILL = {
  ink: { mark: 'var(--charcoal)', word: 'var(--charcoal)' },
  cream: { mark: 'var(--honey-500)', word: 'var(--on-dark)' },
  inherit: { mark: 'currentColor', word: 'currentColor' },
} as const

export function BrandMark({
  size = 'md',
  tone = 'ink',
  showWordmark = true,
}: {
  /** The mark's height. A number for anywhere the named scale does not fit. */
  size?: 'sm' | 'md' | 'lg' | number
  /** ink on light, cream on dark, inherit for a mark sitting in a run of icons. */
  tone?: 'ink' | 'cream' | 'inherit'
  showWordmark?: boolean
}) {
  const h = typeof size === 'number' ? size : HEIGHTS[size]
  const wordPx = typeof size === 'number' ? Math.round(h * WORDMARK) : WORDMARK_PX[size]
  const fill = FILL[tone]
  return (
    <span className="inline-flex items-center" style={{ gap: Math.round(h * GAP) }}>
      <svg
        // Unrounded on purpose: the box is then exactly the mark's, rather
        // than the mark centred in a box a fraction of a pixel too wide.
        width={h * RATIO}
        height={h}
        viewBox={VIEW_BOX}
        aria-hidden="true"
        style={{ display: 'block', flex: 'none' }}
      >
        {/* evenodd is what makes this one path: crossing counts give the ring,
            the field and the dots out of a single silhouette, so recolouring is
            one attribute and no variant can drift from another. */}
        <path d={h >= FULL_MARK_FROM ? FULL : SILHOUETTE} fill={fill.mark} fillRule="evenodd" />
      </svg>
      {showWordmark && (
        <span
          className="font-display font-extrabold leading-none"
          style={{ fontSize: wordPx, letterSpacing: '-0.01em', color: fill.word }}
        >
          Hive
        </span>
      )}
    </span>
  )
}
