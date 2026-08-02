import type { NotifTopic } from './notify'
import type { StringKey } from './lang'

// Rows of the Account page's notification matrix. Only topics the pipeline
// actually sends today; no decorative rows for things that don't exist.
//
// The label is a key, not a sentence. This is a module-level const, and a
// sentence in one freezes whichever language loaded first on that server.
export const NOTIF_TOPICS: { key: NotifTopic; labelKey: StringKey }[] = [
  { key: 'new_event', labelKey: 'notif.topic.new_event' },
  { key: 'reminders', labelKey: 'notif.topic.reminders' },
  { key: 'rsvp_waitlist', labelKey: 'notif.topic.rsvp_waitlist' },
  { key: 'payments', labelKey: 'notif.topic.payments' },
  { key: 'approvals', labelKey: 'notif.topic.approvals' },
]
