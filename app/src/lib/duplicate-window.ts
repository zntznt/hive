// Where a duplicated event goes looking for its date.
//
// The rule is one line: push the old scheduling window forward in whole weeks
// until it starts in the future. Clubs meet on a weekday ("Los Jueves"), so
// keeping the weekday is what makes the copy feel right.
//
// It lives here because two things need the same answer and must not compute
// it twice. The confirmation modal says "buscando fecha la semana del 12 de
// agosto" before anything is created, and the action then creates it. A modal
// promising one week while the action picks another is the kind of drift that
// only shows up after the whole club has already been told.

export type Window = { start: string; end: string } | null

// `extraWeeks` is what the modal's week picker adds: the organizer looking at
// "the week of the 12th" and deciding they want the one after it.
export function duplicateWindow(
  schedStart: string | null,
  schedEnd: string | null,
  extraWeeks = 0,
  now: Date = new Date()
): Window {
  if (!schedStart) return null
  const today = new Date(now)
  today.setUTCHours(0, 0, 0, 0)
  const start = new Date(`${schedStart}T00:00:00Z`)
  const span = schedEnd ? (Date.parse(`${schedEnd}T00:00:00Z`) - start.getTime()) / 86_400_000 : 0
  while (start <= today) start.setUTCDate(start.getUTCDate() + 7)
  start.setUTCDate(start.getUTCDate() + extraWeeks * 7)
  const end = new Date(start.getTime() + span * 86_400_000)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

// "12 de agosto". The modal says the week in words rather than showing a date
// field, because a field invites editing a thing the members are about to
// decide for themselves: this only says which week to look in.
export function weekLabel(isoDate: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Mexico_City',
  }).format(new Date(`${isoDate}T12:00:00Z`))
}
