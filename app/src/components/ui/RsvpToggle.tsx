// Going / Maybe / Can't. Labels are literal, never themed. RSVP is committed
// via a server-action form per button (see e/[slug]/page.tsx), so this module
// only exports the shared layout pieces rather than owning click handling.
export const RSVP_OPTIONS: { v: 'in' | 'maybe' | 'out'; l: string }[] = [
  { v: 'in', l: 'Voy' },
  { v: 'maybe', l: 'Quizás' },
  { v: 'out', l: 'No voy' },
]

export function rsvpButtonClass(on: boolean) {
  return `w-full rounded-md py-[11px] px-2 text-center font-display text-sm ${
    on ? 'font-bold bg-honey-500 text-charcoal shadow-lip' : 'font-semibold bg-cream-sunk text-ink-500'
  }`
}
