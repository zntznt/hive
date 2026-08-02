export type Profile = {
  id: string
  display_name: string
  avatar_color: string | null
  email: string | null
  phone_whatsapp: string | null
  status: 'pending' | 'active' | 'disabled'
  is_app_admin: boolean
  // when they signed up, which is how the verification queue orders itself
  created_at: string | null
}

export type EventRow = {
  id: string
  club_id: string | null
  category_id: string | null
  slug: string
  title: string
  description: string | null
  location: string | null
  // The pin, when somebody dropped one. Where lat is set it is the place: the
  // preview centres on it and directions route to it, and the location text
  // goes back to being a label people read.
  lat: number | null
  lng: number | null
  // The street line, reverse-geocoded from the pin. On the day this leads and
  // the venue name drops beneath it.
  area: string | null
  status: 'draft' | 'scheduling' | 'scheduled' | 'done' | 'cancelled'
  organizer_user_id: string
  allow_guests: boolean
  // How many people each member may bring, 1 to 5. Null means none. A boolean
  // could only ever say "one", which is not what people do.
  max_guests_per_member: number | null
  join_policy: 'club_members_only' | 'anyone_with_link' | 'invite_only'
  capacity: number | null
  waitlist_enabled: boolean
  confirm_deadline: string | null
  sched_start_date: string | null
  sched_end_date: string | null
  sched_time_min: number
  sched_time_max: number
  sched_slot_minutes: number
  chosen_start: string | null
  chosen_end: string | null
  // when the time was locked, and when it was called off. Kept so the event
  // can carry its own receipt instead of the app keeping a notification log.
  scheduled_at: string | null
  cancelled_at: string | null
  closed_at: string | null
  closed_by: string | null
  duplicated_from: string | null
  // when the organizer passed the roll call. Null means it has not been taken,
  // which is what tells the event page to ask.
  attendance_taken_at: string | null
  // the 30 day bin. A binned event leaves every list but stays reachable by
  // direct link, which is the only way to restore it.
  deleted_at: string | null
  deleted_by: string | null
  // when the organizer opened it, which while it is still looking for a date
  // is the same thing as when the availability poll opened
  created_at: string | null
}

export type Contribution = {
  id: string
  event_id: string
  kind: 'bring' | 'task'
  title: string
  qty: string | null
  created_by: string
  assigned_to: string | null
  due: string | null
  done: boolean
}

export type RsvpStatus = 'in' | 'out' | 'maybe'
