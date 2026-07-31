export type Profile = {
  id: string
  display_name: string
  avatar_color: string | null
  email: string | null
  phone_whatsapp: string | null
  status: 'pending' | 'active' | 'disabled'
  is_app_admin: boolean
}

export type EventRow = {
  id: string
  club_id: string | null
  category_id: string | null
  slug: string
  title: string
  description: string | null
  location: string | null
  status: 'draft' | 'scheduling' | 'scheduled' | 'done' | 'cancelled'
  organizer_user_id: string
  allow_guests: boolean
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
  // when the organizer passed the roll call. Null means it has not been taken,
  // which is what tells the event page to ask.
  attendance_taken_at: string | null
  // the 30 day bin. A binned event leaves every list but stays reachable by
  // direct link, which is the only way to restore it.
  deleted_at: string | null
  deleted_by: string | null
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
