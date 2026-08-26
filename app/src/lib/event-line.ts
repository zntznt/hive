import { t as translate, tf as format, type Lang, type StringKey } from './lang'
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

// Present or past, decided once.
//
// The same RSVP count is printed in three places and each picked its own
// tense. The where-card said "2 van" and the section under it "van 2", both in
// the present, on a night that finished a fortnight ago; the Eventos tab said
// "2 fueron" on every row it drew, including the ones that have not happened
// yet, so an event next Thursday read "Bar El Cofre · 3 fueron". Two of the
// three were wrong at any given moment and never the same two.
//
// The count itself is the same fact either way: these are the people who said
// yes. Only the verb moves, so only the verb lives here, and `done` comes from
// `hasHappened` rather than from each screen's own idea of over.
export type AttendanceKeys = {
  // the section heading: "Quién va" / "Quiénes fueron"
  heading: StringKey
  // leading the line: "van 2" / "fueron 2"
  count: StringKey
  // trailing a place: "2 van" / "2 fueron"
  inline: StringKey
  // " · no van 2" / " · no fueron 2"
  notGoing: StringKey
}

export const attendanceKeys = (done: boolean): AttendanceKeys =>
  done
    ? { heading: 'event.went', count: 'event.wentN', inline: 'event.wentCount', notGoing: 'event.notWentN' }
    : { heading: 'event.going', count: 'event.goingN', inline: 'event.goingCount', notGoing: 'event.notGoingN' }

// "Ana y Diego", "Ana, Diego y Lucía", "Ana, Diego y 3 más".
//
// Spanish joins a list with "y" before the last item and no comma in front of
// it. The exception is real and people notice it: "y" becomes "e" before a
// word that starts with an i sound, so it is "Ana e Inés", never "Ana y
// Inés". Hi- counts (Hilda), but hie- does not (hierro keeps "y"), because
// there the i is not the sound doing the work.
export function nameList(names: string[], max = 3, lang: Lang = 'es'): string {
  const clean = names.filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0]

  const shown = clean.length > max ? clean.slice(0, max) : clean.slice(0, -1)
  const last = clean.length > max ? format(lang, 'list.more', { n: clean.length - max }) : clean[clean.length - 1]
  // The y/e alternation is Spanish grammar, so it only applies in Spanish.
  const conj = lang === 'en' ? 'and' : /^[iíIÍ]|^[hH][iíIÍ](?![eE])/.test(last) ? 'e' : 'y'
  return `${shown.join(', ')} ${conj} ${last}`
}

// `lang` defaults to Spanish so a caller that has not been given one still
// gets the app's own language rather than a key.
export function attendanceLine(going: number, mine: MyRsvp, anyAnswer: boolean, lang: Lang = 'es'): string {
  const t = (k: StringKey) => translate(lang, k)
  const f = (k: StringKey, v: Record<string, string | number>) => format(lang, k, v)
  if (!anyAnswer) return t('line.nobodyAnswered')
  if (mine === 'in') return going > 1 ? f('line.youAndMore', { n: going - 1 }) : t('line.youGo')
  // "van 0" is a count where a sentence belongs, and it reads as a mistake
  // next to a row of no faces. Nobody has said yes yet is the actual news.
  if (going === 0) {
    if (mine === 'maybe') return t('line.nobodyYetMaybe')
    if (mine === 'out') return t('line.nobodyYetYouOut')
    return t('line.nobodyYet')
  }
  if (mine === 'maybe') return f('line.goingMaybe', { n: going })
  if (mine === 'out') return f('line.goingYouOut', { n: going })
  return f('line.goingUnanswered', { n: going })
}
