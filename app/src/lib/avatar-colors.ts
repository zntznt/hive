// The one palette an avatar tile is ever coloured from.
//
// There were two. `BUG_COLORS` in BugAvatar dealt from eight, `PALETTE` in
// HexAvatar hashed a name into six, and the two lists shared five values. So a
// club and a member could be dealt "the same" colour and not match, and one of
// them had a colour the other could never produce. Both read this now, which
// is the deliberate answer to a question that used to be answered by accident:
// clubs and members share a palette. They sit next to each other on every
// screen, so a tile that reads as Hive on one has to read as Hive on the other.
//
// Eight rather than the nine the two lists held between them. The one that got
// dropped, `#C9944A`, is a third honey a shade off the first two, and at 24px
// three honeys in a picker of nine stop telling anyone apart, which is the
// only job these have.
//
// These are hex literals rather than `var(--avatar-n)` because a member's
// choice is written to the database as a hex string. A stored colour has to
// survive a token rename, has to render in an email and a push icon where no
// stylesheet is loaded, and has to be an actual value the picker can compare
// with `===`. That is also why globals.css does not carry a mirror of this
// list: a second copy could only drift, and it could not govern the first,
// since retuning `--honey-500` cannot reach a hex already sitting in a row.
//
// The first three are the honey and sage from globals.css, held to the same
// values on purpose: an avatar is the app's own colour, not a decoration
// beside it. Retune those tokens and retune these with them.
export const AVATAR_COLORS = [
  '#EBA937', // = --honey-500
  '#F2B84A', // = --honey-400
  '#FFD27A',
  '#9BAF7E', // = --sage-300
  '#7FA3A0',
  '#E08A5B',
  '#C98BB0',
  '#8AA0D9',
] as const

// What an avatar is when nobody has chosen and nothing has been hashed. Named
// rather than written out, because it used to be `'#EBA937'` typed a fourth
// time in Avatar.tsx and there is no way to notice that from the palette.
export const AVATAR_FALLBACK: string = AVATAR_COLORS[0]

// A stable colour for something that does not get to choose one: a club, or a
// pending invitation that is still just an address. The same name always draws
// the same tile, so a club does not change colour between two screens.
export function avatarColorFor(name: string): string {
  const sum = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}
