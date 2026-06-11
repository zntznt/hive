'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import type { RsvpStatus } from '@/lib/types'

export async function signOut() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/')
}

export async function setRsvp(eventId: string, slug: string, status: RsvpStatus) {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('rsvp_set', { eid: eventId, st: status })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function saveAvailability(eventId: string, slug: string, slots: number[]) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { error } = await supabase
    .from('availability')
    .upsert({ event_id: eventId, user_id: user.id, slots })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function pickSlot(eventId: string, slug: string, startIso: string, endIso: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('pick_slot', {
    eid: eventId,
    slot_start: startIso,
    slot_end: endIso,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function addContribution(eventId: string, slug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return
  const qty = String(formData.get('qty') ?? '').trim() || null
  const kind = formData.get('kind') === 'task' ? 'task' : 'bring'
  const assignedRaw = String(formData.get('assigned_to') ?? '')
  // members may only create for themselves; organizers may pick anyone or leave open.
  // RLS enforces this server-side regardless of what the form sends.
  const assigned_to = assignedRaw === '' ? user.id : assignedRaw === 'open' ? null : assignedRaw
  const { error } = await supabase.from('contributions').insert({
    event_id: eventId,
    title,
    qty,
    kind,
    created_by: user.id,
    assigned_to,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function claimContribution(id: string, slug: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { error } = await supabase
    .from('contributions')
    .update({ assigned_to: user.id })
    .eq('id', id)
    .is('assigned_to', null)
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function toggleContribution(id: string, slug: string, done: boolean) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('contributions').update({ done }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function setUserStatus(userId: string, status: 'active' | 'disabled') {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('admin_set_user_status', {
    target: userId,
    new_status: status,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function createClub(formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return
  const { randomSlug } = await import('@/lib/slug')
  const slug = randomSlug()
  const { error } = await supabase.from('clubs').insert({ slug, name, created_by: user.id })
  if (error) throw new Error(error.message)
  redirect(`/club/${slug}`)
}

export async function createCategory(clubId: string, clubSlug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return
  const emoji = String(formData.get('emoji') ?? '').trim() || null
  const { error } = await supabase
    .from('event_categories')
    .insert({ club_id: clubId, name, emoji })
  if (error) throw new Error(error.message)
  revalidatePath(`/club/${clubSlug}`)
}

export async function createEvent(clubId: string, clubSlug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const title = String(formData.get('title') ?? '').trim()
  const startDate = String(formData.get('sched_start_date') ?? '')
  const endDate = String(formData.get('sched_end_date') ?? '')
  if (!title || !startDate || !endDate) throw new Error('faltan campos obligatorios')
  if (endDate < startDate) throw new Error('la fecha final es anterior a la inicial')

  const capacityRaw = String(formData.get('capacity') ?? '').trim()
  const deadlineRaw = String(formData.get('confirm_deadline') ?? '').trim()
  const categoryRaw = String(formData.get('category_id') ?? '')
  const { randomSlug } = await import('@/lib/slug')
  const slug = randomSlug()

  const { error } = await supabase.from('events').insert({
    club_id: clubId,
    category_id: categoryRaw || null,
    slug,
    title,
    location: String(formData.get('location') ?? '').trim() || null,
    description: String(formData.get('description') ?? '').trim() || null,
    status: 'scheduling',
    organizer_user_id: user.id,
    join_policy: String(formData.get('join_policy') ?? 'club_members_only'),
    allow_guests: formData.get('allow_guests') === 'on',
    capacity: capacityRaw ? Number(capacityRaw) : null,
    waitlist_enabled: formData.get('waitlist_enabled') === 'on' && !!capacityRaw,
    confirm_deadline: deadlineRaw ? new Date(deadlineRaw).toISOString() : null,
    sched_start_date: startDate,
    sched_end_date: endDate,
    sched_time_min: Number(formData.get('time_min') ?? 1140),
    sched_time_max: Number(formData.get('time_max') ?? 1380),
    sched_slot_minutes: Number(formData.get('slot_minutes') ?? 60),
  })
  if (error) throw new Error(error.message)
  redirect(`/e/${slug}`)
}

export async function createInvitation(
  eventId: string,
  clubId: string | null,
  slug: string,
  formData: FormData
) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const email = String(formData.get('email') ?? '').trim() || null
  const phone = String(formData.get('phone') ?? '').trim() || null
  if (!email && !phone) return
  const { data: me } = await supabase.from('users').select('is_app_admin').eq('id', user.id).single()
  const { error } = await supabase.from('invitations').insert({
    event_id: eventId,
    club_id: clubId,
    email,
    phone,
    invited_by: user.id,
    auto_activate: !!me?.is_app_admin,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}/invites`)
}

export async function updateJoinPolicy(eventId: string, slug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const policy = String(formData.get('join_policy') ?? 'club_members_only')
  const { error } = await supabase.from('events').update({ join_policy: policy }).eq('id', eventId)
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}/invites`)
}

export async function addExpense(eventId: string, slug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const { parseEurToCents } = await import('@/lib/money')
  const cents = parseEurToCents(String(formData.get('amount') ?? ''))
  if (!cents) throw new Error('importe no válido')
  const participants = formData.getAll('participant').map(String)
  const user_ids = participants.filter((p) => p.startsWith('u:')).map((p) => p.slice(2))
  const guest_ids = participants.filter((p) => p.startsWith('g:')).map((p) => p.slice(2))
  const { error } = await supabase.rpc('add_expense_with_shares', {
    eid: eventId,
    amount: cents,
    note_text: String(formData.get('note') ?? ''),
    user_ids,
    guest_ids,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function recordSettlement(
  eventId: string,
  slug: string,
  toUser: string,
  amountCents: number
) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { error } = await supabase.from('settlements').insert({
    event_id: eventId,
    from_user: user.id,
    to_user: toUser,
    amount_cents: amountCents,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function confirmSettlement(id: string, slug: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('settlements').update({ confirmed: true }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}
