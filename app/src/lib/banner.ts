// What shape a club cover is framed at.
//
// This is the cropper's number and nothing else now. Nothing draws a fixed
// strip: the club page header paints the photo as the card's own background
// under a scrim, and the card's height is whatever its name, meta line and
// description come to. The Clubs tab does not show the cover at all, it wears
// the honeycomb.
//
// So the old promise, that what you framed was pixel-for-pixel what you got,
// is gone, and it is worth being plain about why rather than leaving the
// number looking like a guarantee. `background-size: cover` fills a box that
// is much squarer than 5:2, so the frame is scaled up until it covers and the
// sides are cut. A longer description makes the card taller and cuts more.
// The middle of the crop is what survives, always.
//
// That is the kit's own behaviour (ClubPage.jsx paints `cover` too), and the
// kit frames at 4:1. 5:2 is kept rather than matched to it precisely because
// it is nearer the card's real shape, so less of what somebody framed gets
// thrown away. It is also the shape people expect of a cover elsewhere, and
// it holds a real photograph: nothing anybody shoots is 4:1, a phone shoots
// 4:3, and that frame discards two thirds of the picture before the card has
// even had its turn.
//
// If the cut ever needs to be exact again, the fix is a fixed-ratio element
// behind the scrim rather than a wider crop. Widening the crop only moves the
// loss earlier.
export const BANNER_ASPECT = 2.5

// `BANNER_ASPECT_CLASS` lived here so Tailwind had a literal to read, back
// when both heads drew the ratio as a strip. Neither does, so it is gone
// rather than left as an export nobody imports.
