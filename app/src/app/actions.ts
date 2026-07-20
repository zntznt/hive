'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import type { RsvpStatus } from '@/lib/types'
import { queueNotification, dispatchQueuedNotifications, sendTemplatedEmail } from '@/lib/notify'

type Supabase = Awaited<ReturnType<typeof supabaseServer>>

async function clubPermission(supabase: Supabase, userId: string, clubId: string) {
  const [{ data: membership }, { data: me }] = await Promise.all([
    supabase.from('club_members').select('role').eq('club_id', clubId).eq('user_id', userId).maybeSingle(),
    supabase.from('users').select('is_app_admin').eq('id', userId).single(),
  ])
  const isAdmin = membership?.role === 'admin' || !!me?.is_app_admin
  const isOrganizer = membership?.role === 'organizer'
  return { isAdmin, isOrganizer, isManager: isAdmin || isOrganizer }
}

const CHANGE_REQUEST_SUMMARY: Record<string, string> = {
  about: 'la descripción del club',
  category_add: 'una nueva categoría',
  category_edit: 'editar una categoría',
  category_delete: 'eliminar una categoría',
  banner: 'la portada del club',
  member_removal: 'quitar a un miembro',
}

export async function signOut() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/')
}

export async function setRsvp(eventId: string, slug: string, status: RsvpStatus) {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('rsvp_set', { eid: eventId, st: status })
  if (error) throw new Error(error.message)
  // rsvp_set may promote someone off the waitlist, which queues a
  // waitlist_promoted notification (0003) - send it now instead of leaving
  // it queued forever.
  await dispatchQueuedNotifications(supabase)
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

export async function addGuest(eventId: string, slug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return
  const { error } = await supabase.from('guests').insert({ event_id: eventId, host_user_id: user.id, name })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function removeGuest(guestId: string, slug: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('guests').delete().eq('id', guestId)
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

// admins write the category directly; organizers propose it and it lands in
// the admin approvals queue (change_requests, applied atomically on approve).
export async function proposeOrEditCategory(
  clubId: string,
  clubSlug: string,
  categoryId: string | null,
  formData: FormData
) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return
  const emoji = String(formData.get('emoji') ?? '').trim() || null
  const perm = await clubPermission(supabase, user.id, clubId)

  if (perm.isAdmin) {
    const { error } = categoryId
      ? await supabase.from('event_categories').update({ name, emoji }).eq('id', categoryId).eq('club_id', clubId)
      : await supabase.from('event_categories').insert({ club_id: clubId, name, emoji })
    if (error) throw new Error(error.message)
  } else {
    const payload = categoryId ? { category_id: categoryId, name, emoji } : { name, emoji }
    const { error } = await supabase.from('change_requests').insert({
      club_id: clubId,
      kind: categoryId ? 'category_edit' : 'category_add',
      payload,
      requested_by: user.id,
    })
    if (error) throw new Error(error.message)
  }
  revalidatePath(`/club/${clubSlug}`)
}

export async function deleteCategory(clubId: string, clubSlug: string, categoryId: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const perm = await clubPermission(supabase, user.id, clubId)
  if (perm.isAdmin) {
    const { error } = await supabase.from('event_categories').delete().eq('id', categoryId).eq('club_id', clubId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('change_requests').insert({
      club_id: clubId,
      kind: 'category_delete',
      payload: { category_id: categoryId },
      requested_by: user.id,
    })
    if (error) throw new Error(error.message)
  }
  revalidatePath(`/club/${clubSlug}`)
}

export async function updateClubAbout(clubId: string, clubSlug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const description = String(formData.get('description') ?? '').trim()
  const whatsapp = String(formData.get('whatsapp_link') ?? '').trim()
  const links = whatsapp ? [{ label: 'WhatsApp', url: whatsapp }] : []
  const perm = await clubPermission(supabase, user.id, clubId)

  if (perm.isAdmin) {
    const { error } = await supabase.from('clubs').update({ description, links }).eq('id', clubId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('change_requests').insert({
      club_id: clubId,
      kind: 'about',
      payload: { description, links },
      requested_by: user.id,
    })
    if (error) throw new Error(error.message)
  }
  revalidatePath(`/club/${clubSlug}`)
}

export async function updateClubBanner(clubId: string, clubSlug: string, bannerUrl: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const perm = await clubPermission(supabase, user.id, clubId)
  if (perm.isAdmin) {
    const { error } = await supabase.from('clubs').update({ banner_url: bannerUrl }).eq('id', clubId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('change_requests').insert({
      club_id: clubId,
      kind: 'banner',
      payload: { banner_url: bannerUrl },
      requested_by: user.id,
    })
    if (error) throw new Error(error.message)
  }
  revalidatePath(`/club/${clubSlug}`)
}

export async function updateMemberRole(clubId: string, clubSlug: string, userId: string, role: 'member' | 'organizer' | 'admin') {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('club_members').update({ role }).eq('club_id', clubId).eq('user_id', userId)
  if (error) throw new Error(error.message)
  revalidatePath(`/club/${clubSlug}`)
}

// club-level invite (no specific event) - admin only per invitations_insert RLS.
export async function createClubInvitation(clubId: string, clubSlug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const email = String(formData.get('email') ?? '').trim() || null
  const phone = String(formData.get('phone') ?? '').trim() || null
  if (!email && !phone) return
  const [{ data: inviter }, { data: club }] = await Promise.all([
    supabase.from('users').select('display_name').eq('id', user.id).single(),
    supabase.from('clubs').select('name').eq('id', clubId).single(),
  ])
  const { data: invitation, error } = await supabase
    .from('invitations')
    .insert({ club_id: clubId, email, phone, invited_by: user.id })
    .select('token')
    .single()
  if (error) throw new Error(error.message)
  if (email && invitation) {
    const link = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/i/${invitation.token}`
    await sendTemplatedEmail(supabase, {
      to: email,
      template: 'invitation',
      vars: { inviter: inviter?.display_name ?? 'Alguien', title: club?.name ?? 'un club en Hive', link },
    })
  }
  revalidatePath(`/club/${clubSlug}`)
}

export async function updateClubJoinMode(clubId: string, clubSlug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const mode = String(formData.get('join_mode') ?? 'invite_only')
  const { error } = await supabase.from('clubs').update({ join_mode: mode }).eq('id', clubId)
  if (error) throw new Error(error.message)
  revalidatePath(`/club/${clubSlug}`)
}

// admin-direct removal (RLS club_members_delete already allows the admin
// branch); organizers instead go through decideChangeRequest's member_removal
// kind proposed from the club page.
export async function removeMember(clubId: string, clubSlug: string, userId: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId)
  if (error) throw new Error(error.message)
  revalidatePath(`/club/${clubSlug}`)
}

export async function requestMemberRemoval(clubId: string, clubSlug: string, userId: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { error } = await supabase.from('change_requests').insert({
    club_id: clubId,
    kind: 'member_removal',
    payload: { user_id: userId },
    requested_by: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/club/${clubSlug}`)
}

export async function leaveClub(clubId: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { error } = await supabase.from('club_members').delete().eq('club_id', clubId).eq('user_id', user.id)
  if (error) throw new Error(error.message)
  redirect('/')
}

export async function deleteClub(clubId: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('clubs').delete().eq('id', clubId)
  if (error) throw new Error(error.message)
  redirect('/')
}

export async function requestJoinClub(joinToken: string, _prev: string | null): Promise<string> {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('request_join_club', { jtoken: joinToken })
  if (error) return error.message
  return 'ok'
}

export async function decideJoinRequest(reqId: string, clubSlug: string, approve: boolean) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  if (approve) {
    const { error } = await supabase.rpc('approve_join_request', { req_id: reqId })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('club_join_requests')
      .update({ status: 'declined', decided_by: user.id, decided_at: new Date().toISOString() })
      .eq('id', reqId)
    if (error) throw new Error(error.message)
  }

  const { data: req } = await supabase
    .from('club_join_requests')
    .select('user_id, clubs(name)')
    .eq('id', reqId)
    .single()
  if (req) {
    const clubName = (req.clubs as unknown as { name: string } | null)?.name ?? 'tu club'
    await queueNotification(supabase, {
      userId: req.user_id,
      template: approve ? 'join_request_approved' : 'join_request_declined',
      vars: { club: clubName, link: process.env.NEXT_PUBLIC_SITE_URL ?? '' },
    })
    await dispatchQueuedNotifications(supabase)
  }
  revalidatePath('/admin')
  revalidatePath(`/club/${clubSlug}`)
}

export async function decideChangeRequest(reqId: string, clubSlug: string, approve: boolean) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  if (approve) {
    const { error } = await supabase.rpc('approve_change_request', { req_id: reqId })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('change_requests')
      .update({ status: 'declined', decided_by: user.id, decided_at: new Date().toISOString() })
      .eq('id', reqId)
    if (error) throw new Error(error.message)
  }

  const { data: req } = await supabase
    .from('change_requests')
    .select('requested_by, kind, clubs(name)')
    .eq('id', reqId)
    .single()
  if (req) {
    const clubName = (req.clubs as unknown as { name: string } | null)?.name ?? 'tu club'
    await queueNotification(supabase, {
      userId: req.requested_by,
      template: approve ? 'change_request_approved' : 'change_request_declined',
      vars: { club: clubName, summary: CHANGE_REQUEST_SUMMARY[req.kind] ?? req.kind },
    })
    await dispatchQueuedNotifications(supabase)
  }
  revalidatePath('/admin')
  revalidatePath(`/club/${clubSlug}`)
}

export async function toggleAppAdmin(userId: string, makeAdmin: boolean) {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('admin_set_app_admin', { target: userId, make_admin: makeAdmin })
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function updateNotificationTemplate(channel: 'email' | 'whatsapp', key: string, formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const subject = String(formData.get('subject') ?? '').trim() || null
  const body = String(formData.get('body') ?? '').trim()
  if (!body) throw new Error('El cuerpo no puede quedar vacío.')
  const { error } = await supabase
    .from('notification_templates')
    .update({ subject, body, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
    .eq('channel', channel)
    .eq('key', key)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

// returns an error string for the form to show inline, or redirects on success.
// (throwing would crash the page to a 500 and lose what the user typed.)
export async function createEvent(
  clubId: string,
  clubSlug: string,
  _prev: string | null,
  formData: FormData
): Promise<string | null> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'Tu sesión expiró. Vuelve a entrar.'

  const title = String(formData.get('title') ?? '').trim()
  const startDate = String(formData.get('sched_start_date') ?? '')
  const endDate = String(formData.get('sched_end_date') ?? '')
  if (!title || !startDate || !endDate) return 'Faltan campos obligatorios.'
  if (endDate < startDate) return 'La fecha final no puede ser antes de la inicial.'

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
  if (error) return 'No se pudo crear el evento. Inténtalo de nuevo.'
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
  const [{ data: me }, { data: inviter }, { data: event }] = await Promise.all([
    supabase.from('users').select('is_app_admin').eq('id', user.id).single(),
    supabase.from('users').select('display_name').eq('id', user.id).single(),
    supabase.from('events').select('title').eq('id', eventId).maybeSingle(),
  ])
  const { data: invitation, error } = await supabase
    .from('invitations')
    .insert({
      event_id: eventId,
      club_id: clubId,
      email,
      phone,
      invited_by: user.id,
      auto_activate: !!me?.is_app_admin,
    })
    .select('token')
    .single()
  if (error) throw new Error(error.message)
  if (email && invitation) {
    const link = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/i/${invitation.token}`
    await sendTemplatedEmail(supabase, {
      to: email,
      template: 'invitation',
      vars: { inviter: inviter?.display_name ?? 'Alguien', title: event?.title ?? 'un evento en Hive', link },
    })
  }
  revalidatePath(`/e/${slug}/invites`)
}

export async function updateJoinPolicy(eventId: string, slug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const policy = String(formData.get('join_policy') ?? 'club_members_only')
  const { error } = await supabase.from('events').update({ join_policy: policy }).eq('id', eventId)
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}/invites`)
}

export async function setEventStatus(
  eventId: string,
  slug: string,
  status: 'done' | 'cancelled' | 'scheduled'
) {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('set_event_status', { eid: eventId, new_status: status })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function addExpense(eventId: string, slug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const { parseMoneyToCents } = await import('@/lib/money')
  const cents = parseMoneyToCents(String(formData.get('amount') ?? ''))
  if (!cents) throw new Error('La cantidad no es válida.')
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
  fromUser: string,
  toUser: string,
  amountCents: number,
  method: string | null = null,
  proofPath: string | null = null
) {
  const supabase = await supabaseServer()
  // from_user comes from the suggested transfer (the debtor), NOT the caller -
  // an organizer recording someone else's payment must not credit themselves.
  // RLS (settlements_insert) still rejects a non-organizer forging from_user.
  const { error } = await supabase.from('settlements').insert({
    event_id: eventId,
    from_user: fromUser,
    to_user: toUser,
    amount_cents: amountCents,
    method,
    proof_path: proofPath,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
  revalidatePath('/plate')
  revalidatePath('/')
}

export async function confirmSettlement(id: string, slug: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('settlements').update({ confirmed: true }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
  revalidatePath('/plate')
  revalidatePath('/')
}

// Shared by two distinct UI actions on the same RLS-guarded delete: the payer
// retracting their own claimed payment ("retirar"), and the recipient
// rejecting one they don't recognize ("rechazar") - settlements_delete (0005)
// allows either side (or the organizer) to remove an unconfirmed row.
export async function deleteSettlement(id: string, slug: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('settlements').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
  revalidatePath('/plate')
  revalidatePath('/')
}

export async function createPoll(eventId: string, slug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const question = String(formData.get('question') ?? '').trim()
  const options = formData
    .getAll('option')
    .map((o) => String(o).trim())
    .filter(Boolean)
  if (!question || options.length < 2) return // need a question and at least two options

  const { data: poll, error } = await supabase
    .from('polls')
    .insert({
      event_id: eventId,
      created_by: user.id,
      question,
      kind: formData.get('kind') === 'multi' ? 'multi' : 'single',
      anonymous: formData.get('anonymous') === 'on',
      show_results: formData.get('show_results') === 'after_close' ? 'after_close' : 'always',
    })
    .select('id')
    .single()
  if (error || !poll) throw new Error(error?.message ?? 'no se pudo crear la encuesta')

  const { error: optErr } = await supabase
    .from('poll_options')
    .insert(options.map((label, sort) => ({ poll_id: poll.id, label, sort })))
  if (optErr) throw new Error(optErr.message)
  revalidatePath(`/e/${slug}`)
}

export async function castVote(
  pollId: string,
  optionId: string,
  slug: string,
  kind: 'single' | 'multi'
) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  if (kind === 'multi') {
    // toggle this option independently of the others
    const { data: existing } = await supabase
      .from('votes')
      .select('option_id')
      .eq('poll_id', pollId)
      .eq('option_id', optionId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existing) {
      await supabase
        .from('votes')
        .delete()
        .eq('poll_id', pollId)
        .eq('option_id', optionId)
        .eq('user_id', user.id)
    } else {
      await supabase.from('votes').insert({ poll_id: pollId, option_id: optionId, user_id: user.id })
    }
  } else {
    // single choice: clear my prior vote, then set this one (unless I tapped the same to clear)
    const { data: mine } = await supabase
      .from('votes')
      .select('option_id')
      .eq('poll_id', pollId)
      .eq('user_id', user.id)
    await supabase.from('votes').delete().eq('poll_id', pollId).eq('user_id', user.id)
    const alreadyOnThis = (mine ?? []).some((v) => v.option_id === optionId)
    if (!alreadyOnThis) {
      await supabase.from('votes').insert({ poll_id: pollId, option_id: optionId, user_id: user.id })
    }
  }
  revalidatePath(`/e/${slug}`)
}

export async function applyPollOption(pollId: string, optionId: string, slug: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('apply_poll_option', { pid: pollId, oid: optionId })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

// ── account ──────────────────────────────────────────────────────────────

export async function updateProfile(formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const display_name = String(formData.get('display_name') ?? '').trim()
  if (!display_name) throw new Error('El nombre no puede quedar vacío.')
  const avatar_kind = formData.get('avatar_kind') === 'photo' ? 'photo' : 'bug'
  const avatar_bug = String(formData.get('avatar_bug') ?? 'bug')
  const avatar_color = String(formData.get('avatar_color') ?? '').trim() || null
  const avatar_photo_url = String(formData.get('avatar_photo_url') ?? '').trim() || null
  const { error } = await supabase
    .from('users')
    .update({ display_name, avatar_kind, avatar_bug, avatar_color, avatar_photo_url })
    .eq('id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/account')
  revalidatePath('/')
}

export async function updateNotifPrefs(formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { error } = await supabase
    .from('users')
    .update({ notif_email: formData.get('notif_email') === 'on', notif_whatsapp: formData.get('notif_whatsapp') === 'on' })
    .eq('id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/account')
}

export async function savePaymentMethods(formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const kinds = formData.getAll('method_kind').map(String)
  const values = formData.getAll('method_value').map(String)
  const rows = kinds
    .map((kind, i) => ({ user_id: user.id, kind, value: (values[i] ?? '').trim(), sort: i }))
    .filter((r) => r.value)

  await supabase.from('payment_methods').delete().eq('user_id', user.id)
  if (rows.length) {
    const { error } = await supabase.from('payment_methods').insert(rows)
    if (error) throw new Error(error.message)
  }
  revalidatePath('/account')
}

export async function requestAccountDeletion(formData: FormData) {
  if (String(formData.get('confirm') ?? '') !== 'DELETE') {
    throw new Error('Escribe DELETE para confirmar.')
  }
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('request_account_deletion')
  if (error) throw new Error(error.message)
  await supabase.auth.signOut()
  redirect('/')
}
