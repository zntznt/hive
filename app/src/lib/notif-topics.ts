import type { NotifTopic } from './notify'

// Rows of the Account page's notification matrix. Only topics the pipeline
// actually sends today; no decorative rows for things that don't exist.
export const NOTIF_TOPICS: { key: NotifTopic; label: string }[] = [
  { key: 'new_event', label: 'Nuevos eventos en mis clubs' },
  { key: 'reminders', label: 'Recordatorio el día del evento' },
  { key: 'rsvp_waitlist', label: 'RSVP y lista de espera' },
  { key: 'payments', label: 'Pagos (me pagaron o confirmaron)' },
  { key: 'approvals', label: 'Decisiones de admins (cambios y solicitudes)' },
]
