// The one sentence an event row says about people.
//
// The club page said "van 0 · quizás 0" and Home said nothing at all. Two
// numbers side by side is a readout, not a sentence: it makes you do the
// subtraction to find the only fact you wanted, which is whether the thing
// needs an answer from you.
//
// So the row leads with the faces and then says, in words, where you stand in
// relation to them. "van 3, no has dicho" is the same data with the question
// already asked.

export type MyRsvp = 'in' | 'out' | 'maybe' | null

export function attendanceLine(going: number, mine: MyRsvp, anyAnswer: boolean): string {
  if (!anyAnswer) return 'Nadie ha contestado'
  if (mine === 'in') return going > 1 ? `Vas, y ${going - 1} más` : 'Vas'
  // "van 0" is a count where a sentence belongs, and it reads as a mistake
  // next to a row of no faces. Nobody has said yes yet is the actual news.
  if (going === 0) {
    if (mine === 'maybe') return 'Nadie va todavía, dijiste quizás'
    if (mine === 'out') return 'Nadie va todavía, tú tampoco'
    return 'Nadie va todavía'
  }
  const van = `van ${going}`
  if (mine === 'maybe') return `${van}, dijiste quizás`
  if (mine === 'out') return `${van}, tú no`
  return `${van}, no has dicho`
}
