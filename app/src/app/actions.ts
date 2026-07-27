'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import type { RsvpStatus } from '@/lib/types'
import { queueNotification, dispatchAfterResponse, sendTemplatedEmail, sendTemplatedWhatsapp } from '@/lib/notify'
import { siteUrl } from '@/lib/site-url'
import { normalizePhone } from '@/lib/phone'
import { sendWhatsappMagicLink } from '@/lib/magic-link'
import { nudgeNonResponders } from '@/lib/nudge'

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

// Storage uploads run server-side: the browser Supabase client depends on
// reading the auth cookie from document.cookie, which proved unreliable in
// the wild (uploads went out as anon and RLS rejected them). Server actions
// accept File blobs in FormData, and here the cookie session always works.
async function uploadToBucket(bucket: string, path: string, file: File) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Tu sesión expiró. Vuelve a entrar.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: file.type || 'image/jpeg',
    upsert: true,
  })
  if (error) throw new Error(error.message)
  return { path, userId: user.id }
}

export async function uploadAvatarPhotoAction(formData: FormData): Promise<string> {
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('Falta la imagen.')
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Tu sesión expiró. Vuelve a entrar.')
  const { path } = await uploadToBucket('avatars', `${user.id}/${Date.now()}.jpg`, file)
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

export async function uploadBannerAction(clubId: string, formData: FormData): Promise<string> {
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('Falta la imagen.')
  const { path } = await uploadToBucket('banners', `${clubId}/${Date.now()}.jpg`, file)
  const supabase = await supabaseServer()
  return supabase.storage.from('banners').getPublicUrl(path).data.publicUrl
}

// private bucket: returns the storage path, not a URL; signed URLs are minted
// where the proof is displayed
export async function uploadPaymentProofAction(formData: FormData): Promise<string> {
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('Falta la imagen.')
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Tu sesión expiró. Vuelve a entrar.')
  const { path } = await uploadToBucket('payment-proofs', `${user.id}/${Date.now()}.jpg`, file)
  return path
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
  dispatchAfterResponse(supabase)
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

// The organizer's "abrir un lugar" on the waitlist card: raise capacity by
// one and let promote_waitlist (0003) reconcile, which seats the first in
// line and queues their waitlist_promoted notification.
export async function promoteNextWaitlisted(eventId: string, slug: string) {
  const supabase = await supabaseServer()
  const { data: ev } = await supabase.from('events').select('capacity').eq('id', eventId).single()
  if (ev?.capacity == null) return
  const { error } = await supabase.from('events').update({ capacity: ev.capacity + 1 }).eq('id', eventId)
  if (error) throw new Error(error.message)
  const { error: promoteErr } = await supabase.rpc('promote_waitlist', { eid: eventId })
  if (promoteErr) throw new Error(promoteErr.message)
  dispatchAfterResponse(supabase)
  revalidatePath(`/e/${slug}`)
}

// event_members_insert RLS already restricts this to an existing organizer/admin
export async function addCoOrganizer(eventId: string, slug: string, userId: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('event_members').upsert(
    { event_id: eventId, user_id: userId, role: 'organizer' },
    { onConflict: 'event_id,user_id' }
  )
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

export async function updateContribution(id: string, slug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const title = String(formData.get('title') ?? '').trim()
  const qty = String(formData.get('qty') ?? '').trim() || null
  if (!title) return
  const { error } = await supabase.from('contributions').update({ title, qty }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function removeContribution(id: string, slug: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('contributions').delete().eq('id', id)
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
  const labels = formData.getAll('link_label').map(String)
  const urls = formData.getAll('link_url').map(String)
  const links = labels
    .map((label, i) => ({ label: label.trim(), url: (urls[i] ?? '').trim() }))
    .filter((l) => l.label && l.url)
    .slice(0, 4)
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

export async function updateClubAvatar(clubId: string, clubSlug: string, avatarUrl: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const perm = await clubPermission(supabase, user.id, clubId)
  if (perm.isAdmin) {
    const { error } = await supabase.from('clubs').update({ avatar_url: avatarUrl }).eq('id', clubId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('change_requests').insert({
      club_id: clubId,
      kind: 'avatar',
      payload: { avatar_url: avatarUrl },
      requested_by: user.id,
    })
    if (error) throw new Error(error.message)
  }
  revalidatePath(`/club/${clubSlug}`)
}

// `path` is whichever page is showing the invitations list (club page or an
// event's invites page) - callers pass their own route to revalidate.
export async function revokeInvitation(invitationId: string, path: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('invitations').delete().eq('id', invitationId)
  if (error) throw new Error(error.message)
  revalidatePath(path)
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
  // organizers invite members only; the role picker is admin territory
  const roleRaw = String(formData.get('invited_role') ?? 'member')
  const perm = await clubPermission(supabase, user.id, clubId)
  const invited_role = perm.isAdmin && ['member', 'organizer', 'admin'].includes(roleRaw) ? roleRaw : 'member'
  const [{ data: inviter }, { data: club }] = await Promise.all([
    supabase.from('users').select('display_name').eq('id', user.id).single(),
    supabase.from('clubs').select('name').eq('id', clubId).single(),
  ])
  const { data: invitation, error } = await supabase
    .from('invitations')
    .insert({ club_id: clubId, email, phone, invited_by: user.id, invited_role })
    .select('token')
    .single()
  if (error) throw new Error(error.message)
  if (invitation) {
    const link = `${siteUrl()}/i/${invitation.token}`
    const vars = { inviter: inviter?.display_name ?? 'Alguien', title: club?.name ?? 'un club en Hive', link }
    // Members arrive from a WhatsApp group, so an invitation sent to a number
    // should land there rather than asking them to go find an email.
    if (email) await sendTemplatedEmail(supabase, { to: email, template: 'invitation', vars })
    if (phone) await sendTemplatedWhatsapp(supabase, { to: phone, template: 'invitation', vars })
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
      vars: { club: clubName, link: siteUrl() },
    })
    dispatchAfterResponse(supabase)
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
    dispatchAfterResponse(supabase)
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

// Submits a WhatsApp template for Meta review. Editing the body here only
// changes Hive's copy; Meta keeps delivering whatever it last approved, so
// resubmitting is an explicit act rather than a side effect of saving.
export async function submitWhatsappTemplate(key: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { data: me } = await supabase.from('users').select('is_app_admin').eq('id', user.id).maybeSingle()
  if (!me?.is_app_admin) throw new Error('solo los admins pueden hacer esto')

  const { data: tpl } = await supabase
    .from('notification_templates')
    .select('body, wa_language')
    .eq('channel', 'whatsapp')
    .eq('key', key)
    .maybeSingle()
  if (!tpl) throw new Error('no existe esa plantilla')

  const { createWhatsappTemplate } = await import('@/lib/whatsapp')
  const result = await createWhatsappTemplate({
    name: key,
    language: tpl.wa_language ?? 'es_MX',
    body: tpl.body,
  })

  await supabase
    .from('notification_templates')
    .update(
      result.ok
        ? { wa_status: result.status, wa_vars: result.vars, wa_error: null, wa_synced_at: new Date().toISOString() }
        : { wa_error: result.error, wa_synced_at: new Date().toISOString() }
    )
    .eq('channel', 'whatsapp')
    .eq('key', key)

  revalidatePath('/admin')
  if (!result.ok) throw new Error(result.error)
}

// Meta reviews asynchronously, so statuses only change when we ask.
export async function refreshWhatsappTemplates() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { data: me } = await supabase.from('users').select('is_app_admin').eq('id', user.id).maybeSingle()
  if (!me?.is_app_admin) throw new Error('solo los admins pueden hacer esto')

  const { listWhatsappTemplates } = await import('@/lib/whatsapp')
  const result = await listWhatsappTemplates()
  if (!result.ok) throw new Error(result.error)

  for (const t of result.templates) {
    if (!t.name) continue
    await supabase
      .from('notification_templates')
      .update({ wa_status: t.status, wa_synced_at: new Date().toISOString() })
      .eq('channel', 'whatsapp')
      .eq('key', t.name)
  }
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

  // "nuevos eventos en tus clubs" notification (Account matrix topic
  // new_event): every other club member hears about it per their prefs.
  const [{ data: fellows }, { data: creator }, { data: clubRow }] = await Promise.all([
    supabase.from('club_members').select('user_id').eq('club_id', clubId).neq('user_id', user.id),
    supabase.from('users').select('display_name').eq('id', user.id).single(),
    supabase.from('clubs').select('name').eq('id', clubId).single(),
  ])
  const link = `${siteUrl()}/e/${slug}`
  for (const m of fellows ?? []) {
    await queueNotification(supabase, {
      userId: m.user_id,
      template: 'new_event',
      vars: { creator: creator?.display_name ?? 'Alguien', title, club: clubRow?.name ?? 'tu club', link },
    })
  }
  dispatchAfterResponse(supabase)
  redirect(`/e/${slug}`)
}

// events_update RLS already restricts this to an event organizer. The
// scheduling window (dates/hours/cell size) is only ever sent once a time
// hasn't been picked yet - see event-form.tsx, which hides those fields
// once the event is scheduled.
export async function updateEvent(eventId: string, slug: string, _prev: string | null, formData: FormData): Promise<string | null> {
  const supabase = await supabaseServer()
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return 'Falta el título.'

  const capacityRaw = String(formData.get('capacity') ?? '').trim()
  const deadlineRaw = String(formData.get('confirm_deadline') ?? '').trim()
  const categoryRaw = String(formData.get('category_id') ?? '')

  const patch: Record<string, unknown> = {
    title,
    category_id: categoryRaw || null,
    location: String(formData.get('location') ?? '').trim() || null,
    join_policy: String(formData.get('join_policy') ?? 'club_members_only'),
    allow_guests: formData.get('allow_guests') === 'on',
    capacity: capacityRaw ? Number(capacityRaw) : null,
    waitlist_enabled: formData.get('waitlist_enabled') === 'on' && !!capacityRaw,
    confirm_deadline: deadlineRaw ? new Date(deadlineRaw).toISOString() : null,
  }

  if (formData.has('sched_start_date')) {
    const startDate = String(formData.get('sched_start_date') ?? '')
    const endDate = String(formData.get('sched_end_date') ?? '')
    if (!startDate || !endDate) return 'Faltan las fechas de búsqueda.'
    if (endDate < startDate) return 'La fecha final no puede ser antes de la inicial.'
    patch.sched_start_date = startDate
    patch.sched_end_date = endDate
    patch.sched_time_min = Number(formData.get('time_min') ?? 1140)
    patch.sched_time_max = Number(formData.get('time_max') ?? 1380)
    patch.sched_slot_minutes = Number(formData.get('slot_minutes') ?? 60)
  }

  const { error } = await supabase.from('events').update(patch).eq('id', eventId)
  if (error) return 'No se pudo guardar. Inténtalo de nuevo.'
  revalidatePath(`/e/${slug}`)
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
    const link = `${siteUrl()}/i/${invitation.token}`
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

// event_balances is a computed view over expenses/expense_shares/settlements,
// so editing the amount here alone flows through to everyone's balance on
// the next read - no manual delta/reconciliation bookkeeping needed.
export async function updateExpense(id: string, slug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const { parseMoneyToCents } = await import('@/lib/money')
  const note = String(formData.get('note') ?? '').trim()
  const cents = parseMoneyToCents(String(formData.get('amount') ?? ''))
  if (!note || !cents) throw new Error('Pon una nota y una cantidad válida.')
  const { error } = await supabase.from('expenses').update({ note, amount_cents: cents }).eq('id', id)
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

  // "te pagaron" notification: the recipient hears a payment was claimed and
  // needs their confirmation (Account matrix topic: payments).
  const [{ data: payer }, { data: ev }] = await Promise.all([
    supabase.from('users').select('display_name').eq('id', fromUser).single(),
    supabase.from('events').select('title').eq('id', eventId).single(),
  ])
  const { fmtMoney } = await import('@/lib/money')
  await queueNotification(supabase, {
    userId: toUser,
    template: 'payment_received',
    vars: {
      from: payer?.display_name ?? 'Alguien',
      amount: fmtMoney(amountCents),
      event: ev?.title ?? 'un evento',
      link: `${siteUrl()}/e/${slug}`,
    },
  })
  dispatchAfterResponse(supabase)
  revalidatePath(`/e/${slug}`)
  revalidatePath('/plate')
  revalidatePath('/')
}

export async function confirmSettlement(id: string, slug: string) {
  const supabase = await supabaseServer()
  const { data: row } = await supabase
    .from('settlements')
    .select('from_user, to_user, amount_cents, event_id, events(title)')
    .eq('id', id)
    .maybeSingle()
  const { error } = await supabase.from('settlements').update({ confirmed: true }).eq('id', id)
  if (error) throw new Error(error.message)

  // close the loop with the payer: their claimed payment got confirmed
  if (row) {
    const { data: recipient } = await supabase.from('users').select('display_name').eq('id', row.to_user).single()
    const { fmtMoney } = await import('@/lib/money')
    await queueNotification(supabase, {
      userId: row.from_user,
      template: 'payment_confirmed',
      vars: {
        to: recipient?.display_name ?? 'Alguien',
        amount: fmtMoney(row.amount_cents),
        event: (row.events as unknown as { title: string } | null)?.title ?? 'un evento',
      },
    })
    dispatchAfterResponse(supabase)
  }
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

// "closed" is derived (closes_at <= now), same as the read side already
// computes - closing/reopening just sets or clears that timestamp.
export async function closePoll(id: string, slug: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('polls').update({ closes_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function reopenPoll(id: string, slug: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('polls').update({ closes_at: null }).eq('id', id)
  if (error) throw new Error(error.message)
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

// Saves the Account page's topic x channel notification matrix. The legacy
// notif_email/notif_whatsapp globals stay in sync as "any topic on for this
// channel", so templates without a topic (invitations) keep behaving.
export async function updateNotifPrefs(formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { NOTIF_TOPICS } = await import('@/lib/notif-topics')
  const prefs: Record<string, { email: boolean; whatsapp: boolean }> = {}
  let anyEmail = false
  let anyWhatsapp = false
  for (const t of NOTIF_TOPICS) {
    const email = formData.get(`t_${t.key}_email`) === 'on'
    const whatsapp = formData.get(`t_${t.key}_whatsapp`) === 'on'
    prefs[t.key] = { email, whatsapp }
    anyEmail = anyEmail || email
    anyWhatsapp = anyWhatsapp || whatsapp
  }
  const { error } = await supabase
    .from('users')
    .update({ notif_prefs: prefs, notif_email: anyEmail, notif_whatsapp: anyWhatsapp })
    .eq('id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/account')
}

// Links (or clears) the WhatsApp number notifications are delivered to.
// Sign-in stays email-only, so this is purely a delivery address; it is
// stored normalized to E.164 because that is what the provider expects.
export async function updateWhatsappPhone(formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const raw = String(formData.get('phone') ?? '').trim()
  let phone: string | null = null
  if (raw) {
    const { normalizePhone } = await import('@/lib/phone')
    phone = normalizePhone(raw)
    if (!phone) throw new Error('Ese número no parece válido. Usa 10 dígitos, por ejemplo 55 1234 5678.')
  }

  // Adding a number is a clear enough request to be messaged there, and
  // notif_whatsapp defaults to false, so without this a member saves their
  // number, sees "activo", and still hears nothing. Only on the transition
  // from no number to a number: someone editing a number they already had
  // may have turned WhatsApp off deliberately, and that choice stands.
  const { data: before } = await supabase
    .from('users')
    .select('phone_whatsapp')
    .eq('id', user.id)
    .maybeSingle()
  const firstNumber = !!phone && !before?.phone_whatsapp

  const { error } = await supabase
    .from('users')
    .update(firstNumber ? { phone_whatsapp: phone, notif_whatsapp: true } : { phone_whatsapp: phone })
    .eq('id', user.id)
  if (error) {
    if (error.code === '23505') throw new Error('Ese número ya está registrado en otra cuenta.')
    throw new Error(error.message)
  }
  revalidatePath('/account')
  return { enabledWhatsapp: firstNumber }
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

export async function addSavedPlace(formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const name = String(formData.get('name') ?? '').trim()
  const addr = String(formData.get('addr') ?? '').trim() || null
  const query = String(formData.get('query') ?? '').trim() || name
  if (!name) return
  const { error } = await supabase.from('saved_places').insert({ user_id: user.id, name, addr, query })
  if (error) throw new Error(error.message)
  revalidatePath('/account')
}

export async function removeSavedPlace(id: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('saved_places').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/account')
}

// Sign-in link over WhatsApp. Unauthenticated by design (nobody has a session
// yet), so it takes a phone number and nothing else, normalizes it here rather
// than trusting the client, and never reports whether the number is known.
export async function requestWhatsappLink(rawPhone: string, next?: string | null) {
  const phone = normalizePhone(rawPhone)
  if (!phone) return { ok: false as const, error: 'Ese número no se ve completo. Incluye la clave, por ejemplo +52 55 1234 5678.' }
  return sendWhatsappMagicLink(phone, next)
}

// Post-event roll call. Writes through mark_attendance (SECURITY DEFINER)
// rather than a widened RLS policy, so an organizer can record who came
// without gaining the ability to rewrite what people answered.
export async function markAttendance(eventId: string, slug: string, presentUserIds: string[]) {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('mark_attendance', { eid: eventId, present: presentUserIds })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

// The organizer's own "faltan 4 por confirmar" button. The cron sends this
// automatically two days out; this is for when they want it now.
export async function remindNonResponders(eventId: string, slug: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const queued = await nudgeNonResponders(supabase, eventId)
  dispatchAfterResponse(supabase)
  revalidatePath(`/e/${slug}`)
  return { queued }
}

// "Igual que la última vez": the recurring-club workhorse. Copies an event's
// setup into a fresh one so a weekly club never re-enters the same details.
//
// What carries over is the setup: title, place, category, capacity rules, the
// scheduling window and the list of things people bring. What does not is
// anything that belonged to that particular night: RSVPs, availability,
// expenses, polls, guests.
//
// Contribution assignments are deliberately cleared. Copying "Marta trae la
// mesa" onto a date Marta has not agreed to yet would commit her to something
// she never said yes to. The list is the useful part; the claims are cheap to
// redo and belong to the people making them.
export async function duplicateEvent(eventId: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const { data: src } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle()
  if (!src) throw new Error('No encontramos ese evento.')

  const { randomSlug } = await import('@/lib/slug')
  const slug = randomSlug()

  // Push the old scheduling window forward in whole weeks until it starts in
  // the future. Clubs meet on a weekday ("Los Jueves"), so keeping the weekday
  // is what makes the copy feel right; the organizer can still change it.
  const { sched_start_date, sched_end_date } = src as { sched_start_date: string | null; sched_end_date: string | null }
  let startDate = sched_start_date
  let endDate = sched_end_date
  if (startDate) {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const start = new Date(`${startDate}T00:00:00Z`)
    const span = endDate ? (new Date(`${endDate}T00:00:00Z`).getTime() - start.getTime()) / 86_400_000 : 0
    while (start <= today) start.setUTCDate(start.getUTCDate() + 7)
    startDate = start.toISOString().slice(0, 10)
    const end = new Date(start.getTime() + span * 86_400_000)
    endDate = end.toISOString().slice(0, 10)
  }

  const { data: created, error } = await supabase
    .from('events')
    .insert({
      club_id: src.club_id,
      category_id: src.category_id,
      slug,
      title: src.title,
      location: src.location,
      description: src.description,
      status: 'scheduling',
      organizer_user_id: user.id,
      join_policy: src.join_policy,
      allow_guests: src.allow_guests,
      capacity: src.capacity,
      waitlist_enabled: src.waitlist_enabled,
      // deadlines belong to a specific date, so the copy starts without one
      confirm_deadline: null,
      sched_start_date: startDate,
      sched_end_date: endDate,
      sched_time_min: src.sched_time_min,
      sched_time_max: src.sched_time_max,
      sched_slot_minutes: src.sched_slot_minutes,
    })
    .select('id')
    .single()
  if (error || !created) throw new Error('No se pudo duplicar el evento.')

  const { data: items } = await supabase
    .from('contributions')
    .select('title, qty, kind')
    .eq('event_id', eventId)
  if (items?.length) {
    await supabase.from('contributions').insert(
      items.map((i) => ({
        event_id: created.id,
        title: i.title,
        qty: i.qty,
        kind: i.kind,
        created_by: user.id,
        assigned_to: null,
      }))
    )
  }

  // a duplicate is a new event to everyone else, so the club hears about it
  // on the same terms as one created from scratch
  const [{ data: fellows }, { data: creator }, { data: clubRow }] = await Promise.all([
    supabase.from('club_members').select('user_id').eq('club_id', src.club_id).neq('user_id', user.id),
    supabase.from('users').select('display_name').eq('id', user.id).single(),
    supabase.from('clubs').select('name').eq('id', src.club_id).single(),
  ])
  const link = `${siteUrl()}/e/${slug}`
  for (const m of fellows ?? []) {
    await queueNotification(supabase, {
      userId: m.user_id,
      template: 'new_event',
      vars: { creator: creator?.display_name ?? 'Alguien', title: src.title, club: clubRow?.name ?? 'tu club', link },
    })
  }
  dispatchAfterResponse(supabase)
  redirect(`/e/${slug}`)
}

// Resend an invitation that has not been claimed. Same token, same link, so
// an invite that is sitting in someone's inbox twice still leads to one
// account. Only the email channel resends: a WhatsApp-only invitation has
// nothing to send to until Meta approves an invitation template.
export async function resendInvitation(invitationId: string, path: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const { data: inv } = await supabase
    .from('invitations')
    .select('token, email, phone, club_id, event_id, claimed_by_user_id')
    .eq('id', invitationId)
    .maybeSingle()
  if (!inv) throw new Error('No encontramos esa invitación.')
  if (inv.claimed_by_user_id) return { ok: false as const, error: 'Esa invitación ya se usó.' }
  if (!inv.email && !inv.phone) return { ok: false as const, error: 'Esa invitación no tiene a dónde llegar.' }

  const [{ data: inviter }, { data: club }, { data: event }] = await Promise.all([
    supabase.from('users').select('display_name').eq('id', user.id).single(),
    inv.club_id
      ? supabase.from('clubs').select('name').eq('id', inv.club_id).maybeSingle()
      : Promise.resolve({ data: null }),
    inv.event_id
      ? supabase.from('events').select('title').eq('id', inv.event_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const vars = {
    inviter: inviter?.display_name ?? 'Alguien',
    title: event?.title ?? club?.name ?? 'un club en Hive',
    link: `${siteUrl()}/i/${inv.token}`,
  }
  const result = inv.email
    ? await sendTemplatedEmail(supabase, { to: inv.email, template: 'invitation', vars })
    : await sendTemplatedWhatsapp(supabase, { to: inv.phone as string, template: 'invitation', vars })

  revalidatePath(path)
  if (!result.ok) return { ok: false as const, error: result.error ?? 'No se pudo reenviar.' }
  return { ok: true as const }
}
