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

// "Ana y Diego", "Ana, Diego y Lucía", "Ana, Diego y 3 más".
//
// Spanish joins a list with "y" before the last item and no comma in front of
// it. The exception is real and people notice it: "y" becomes "e" before a
// word that starts with an i sound, so it is "Ana e Inés", never "Ana y
// Inés". Hi- counts (Hilda), but hie- does not (hierro keeps "y"), because
// there the i is not the sound doing the work.
export function nameList(names: string[], max = 3): string {
  const clean = names.filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0]

  const shown = clean.length > max ? clean.slice(0, max) : clean.slice(0, -1)
  const last = clean.length > max ? `${clean.length - max} más` : clean[clean.length - 1]
  const conj = /^[iíIÍ]|^[hH][iíIÍ](?![eE])/.test(last) ? 'e' : 'y'
  return `${shown.join(', ')} ${conj} ${last}`
}

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
