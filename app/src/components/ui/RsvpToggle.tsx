// Going / Maybe / Can't. Labels are literal, never themed. RSVP is committed
// via a server-action form per button (see e/[slug]/page.tsx), so this module
// only exports the shared layout pieces rather than owning click handling.
// The three answers, named once.
//
// The event page used to write them twice: the loud block that takes your
// first answer said "Voy / No puedo / Todavía no sé" and the toggle six rows
// under it, for changing that same answer, said "Voy / Quizás / No voy". You
// could tap "No puedo" and watch "No voy" light up, which reads as the app
// having recorded something other than what you pressed.
//
// Operational words stay literal, so the compact set wins: these are the words
// the rest of the app counts with ("van 3, no has dicho").
export const RSVP_OPTIONS: { v: 'in' | 'maybe' | 'out'; l: string }[] = [
  { v: 'in', l: 'Voy' },
  { v: 'maybe', l: 'Quizás' },
  { v: 'out', l: 'No voy' },
]

export const rsvpLabel = (v: 'in' | 'maybe' | 'out') => RSVP_OPTIONS.find((o) => o.v === v)!.l

export function rsvpButtonClass(on: boolean) {
  return `w-full rounded-md py-[11px] px-2 text-center font-display text-sm ${
    on ? 'font-bold bg-honey-500 text-charcoal shadow-lip' : 'font-semibold bg-cream-sunk text-ink-500'
  }`
}
