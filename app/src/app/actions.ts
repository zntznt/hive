'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { supabaseService } from '@/lib/supabase/service'
import type { RsvpStatus } from '@/lib/types'
import { queueNotification, dispatchAfterResponse, sendTemplatedEmail, sendTemplatedWhatsapp } from '@/lib/notify'
import { siteUrl } from '@/lib/site-url'
import { normalizePhone } from '@/lib/phone'
import { requestSigninCode, verifySigninCode } from '@/lib/signin-code'
import { startPhoneChange, confirmPhoneChange } from '@/lib/phone-verify'
import { nudgeNonResponders, nudgeMissingAvailability } from '@/lib/nudge'
import { getT } from '@/lib/current-lang'
import { t as translate, type Lang, type StringKey } from '@/lib/lang'

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

// A label stored as data is a bug: this map held six Spanish sentences at
// module scope, and they were spliced into the notification the member gets
// when their proposal is decided. So an English member got an English email
// with "la descripción del club" in the middle of it, and the copy froze at
// whichever language loaded the module first.
//
// Keys now, resolved at send time in the language of whoever is READING it,
// which is not the admin who clicked approve. They are two different people.
const CHANGE_REQUEST_SUMMARY: Record<string, StringKey> = {
  about: 'cr.about',
  category_add: 'cr.category_add',
  category_edit: 'cr.category_edit',
  category_delete: 'cr.category_delete',
  banner: 'cr.banner',
  member_removal: 'cr.member_removal',
}

// Storage uploads run server-side: the browser Supabase client depends on
// reading the auth cookie from document.cookie, which proved unreliable in
// the wild (uploads went out as anon and RLS rejected them). Server actions
// accept File blobs in FormData, and here the cookie session always works.
// What may be stored, and how much of it. The buckets enforce the same two
// rules (0032), but file.type came straight from the browser and was passed
// through as contentType, so without this the stored object could claim to be
// anything: on a public bucket served from our own origin, "text/html" is a
// page members' browsers will trust.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

async function uploadToBucket(bucket: string, path: string, file: File) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const contentType = IMAGE_TYPES.includes(file.type) ? file.type : 'image/jpeg'
  if (file.type && !IMAGE_TYPES.includes(file.type)) {
    throw new Error('unsupported image type')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('image over the size limit')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(error.message)
  return { path, userId: user.id }
}

// avatar_photo_url and banner_url are ordinary text columns, and PostgREST
// takes the UPDATE directly, so uploading through the app was never the only
// way to fill them. A banner renders to every member of a club, which makes
// "any address on the internet" a per member request log and an image that can
// change after someone approved it. The database refuses anything else too
// (0032); this is here so the member sees Spanish rather than a constraint
// name.
function ourStorageUrl(url: string | null, bucket: 'avatars' | 'banners') {
  if (!url) return null
  const ok = new RegExp(
    `^https://[a-z0-9-]+\\.supabase\\.co/storage/v1/object/public/${bucket}/[A-Za-z0-9/._-]+$`
  ).test(url)
  if (!ok) throw new Error('image is not in a Hive bucket')
  return url
}

export async function uploadAvatarPhotoAction(formData: FormData): Promise<string> {
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('no image in the form')
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { path } = await uploadToBucket('avatars', `${user.id}/${Date.now()}.jpg`, file)
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

export async function uploadBannerAction(clubId: string, formData: FormData): Promise<string> {
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('no image in the form')
  const { path } = await uploadToBucket('banners', `${clubId}/${Date.now()}.jpg`, file)
  const supabase = await supabaseServer()
  return supabase.storage.from('banners').getPublicUrl(path).data.publicUrl
}

// private bucket: returns the storage path, not a URL; signed URLs are minted
// where the proof is displayed
export async function uploadPaymentProofAction(formData: FormData): Promise<string> {
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('no image in the form')
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
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
  // Join first, and from anywhere. rsvp_set refuses a member the event has
  // never seen, and until now the only thing that made you one was opening the
  // event page, which calls join_event on the way in. So the moment answering
  // moved to the plate, every answer from there failed "not an event member"
  // and the row sat there as if nothing had been pressed. The guard belongs on
  // the action rather than on one of the screens that calls it.
  await supabase.rpc('join_event', { event_slug: slug })
  const { error } = await supabase.rpc('rsvp_set', { eid: eventId, st: status })
  if (error) throw new Error(error.message)
  // rsvp_set may promote someone off the waitlist, which queues a
  // waitlist_promoted notification (0003) - send it now instead of leaving
  // it queued forever.
  dispatchAfterResponse(supabase)
  revalidatePath(`/e/${slug}`)
  // An RSVP is a plate item, so answering one has to clear it everywhere it is
  // drawn: the ledger, the home preview and the tab badge all read the same
  // board and would otherwise keep asking a question you just answered.
  revalidatePath('/plate')
  revalidatePath('/')
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
  // stamped here rather than inside the RPC, so the receipt on the event page
  // does not require reopening a function that already works
  await supabase.from('events').update({ scheduled_at: new Date().toISOString() }).eq('id', eventId)
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
  // guests_fit (0033) refuses a guest who does not fit: "+1" used to be an
  // unlimited door next to a capped one, so the cap meant nothing on any event
  // that allowed guests. The trigger message is already the one to show.
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

// What counts as a club's name, decided once. Both callers ask this: the
// modal that creates a club and the modal that renames one. They used to be
// one `.trim()` each, which is fine until they disagree, and the constraint in
// migration 0055 is the third opinion that would have caught it.
const CLUB_NAME_MAX = 60
function readClubName(formData: FormData): string {
  return String(formData.get('name') ?? '')
    .trim()
    .slice(0, CLUB_NAME_MAX)
}

export async function createClub(formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const name = readClubName(formData)
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

// Making a category from inside the event form, without leaving it.
//
// Categories were only creatable from the club page, so an organizer who
// realized halfway through that "Cata de vinos" doesn't exist yet had to
// abandon a half-filled form, go make it, and come back. Returns the new row
// so the picker can select it on the spot; an organizer who is not an admin
// still goes through the proposal queue and gets told so, rather than seeing
// their category silently not appear.
export async function createCategoryInline(clubId: string, clubSlug: string, name: string) {
  const { t } = await getT()
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const clean = name.trim()
  if (!clean) return { ok: false as const, error: t('err.name.missing') }
  const perm = await clubPermission(supabase, user.id, clubId)

  if (perm.isAdmin) {
    const { data, error } = await supabase
      .from('event_categories')
      .insert({ club_id: clubId, name: clean, emoji: null })
      .select('id, name, emoji')
      .single()
    // (club_id, name) is unique, and "duplicate key value violates unique
    // constraint" is not a sentence to show someone naming a category
    if (error) {
      return {
        ok: false as const,
        error: error.code === '23505' ? t('err.category.dupe') : t('err.category.create'),
      }
    }
    revalidatePath(`/club/${clubSlug}`)
    return { ok: true as const, category: data as { id: string; name: string; emoji: string | null } }
  }

  // a proposal for a name that already exists can never be approved:
  // approve_change_request does a bare insert and the unique constraint aborts
  // the whole transaction, leaving the request stuck at pending forever
  const { data: dupe } = await supabase
    .from('event_categories')
    .select('id')
    .eq('club_id', clubId)
    .ilike('name', clean)
    .maybeSingle()
  if (dupe) return { ok: false as const, error: t('err.category.dupe') }

  const { error } = await supabase.from('change_requests').insert({
    club_id: clubId,
    kind: 'category_add',
    payload: { name: clean, emoji: null },
    requested_by: user.id,
  })
  if (error) return { ok: false as const, error: t('err.proposal.send') }
  revalidatePath(`/club/${clubSlug}`)
  return { ok: true as const, proposed: true as const }
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

// The club's name, description and links: one subject, one modal, one action.
//
// The name was set once when the club was created and then could not be
// changed at all, which is a problem a club runs into about a month in. It
// costs nothing to change: `clubs.slug` is a random string rather than a
// slugified name, so no link breaks, and every screen reads the name live off
// the row rather than keeping a copy.
//
// Returns an error string rather than throwing one, because a thrown message
// does not survive a production build (see the note above the throws below).
export async function updateClubProfile(
  clubId: string,
  clubSlug: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { t } = await getT()
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: t('err.session') }
  const name = readClubName(formData)
  if (!name) return { ok: false, error: t('err.club.nameMissing') }
  const description = String(formData.get('description') ?? '').trim()
  const labels = formData.getAll('link_label').map(String)
  const urls = formData.getAll('link_url').map(String)
  const links = labels
    .map((label, i) => ({ label: label.trim(), url: (urls[i] ?? '').trim() }))
    .filter((l) => l.label && l.url)
    .slice(0, 4)
  const perm = await clubPermission(supabase, user.id, clubId)

  if (perm.isAdmin) {
    const { error } = await supabase.from('clubs').update({ name, description, links }).eq('id', clubId)
    if (error) return { ok: false, error: t('err.save') }
  } else {
    const { error } = await supabase.from('change_requests').insert({
      club_id: clubId,
      kind: 'about',
      payload: { name, description, links },
      requested_by: user.id,
    })
    if (error) return { ok: false, error: t('err.proposal.send') }
  }
  revalidatePath(`/club/${clubSlug}`)
  revalidatePath('/clubs')
  return { ok: true }
}

export async function updateClubBanner(clubId: string, clubSlug: string, bannerUrl: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  // checked here as well as on the column, because the organizer branch parks
  // it in a change_request payload where no constraint can see it until an
  // admin approves and it lands on clubs.banner_url
  const banner_url = ourStorageUrl(bannerUrl?.trim() || null, 'banners')
  const perm = await clubPermission(supabase, user.id, clubId)
  if (perm.isAdmin) {
    const { error } = await supabase.from('clubs').update({ banner_url }).eq('id', clubId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('change_requests').insert({
      club_id: clubId,
      kind: 'banner',
      payload: { banner_url },
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
  // The club picture is a URL column like the other two and was the one
  // writer that skipped this check, so a bad address reached the database and
  // came back as `violates check constraint "clubs_avatar_url_is_ours"`.
  // Same rule, same sentence, wherever it is written from.
  const url = ourStorageUrl(avatarUrl, 'banners')!
  const perm = await clubPermission(supabase, user.id, clubId)
  if (perm.isAdmin) {
    const { error } = await supabase.from('clubs').update({ avatar_url: url }).eq('id', clubId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('change_requests').insert({
      club_id: clubId,
      kind: 'avatar',
      payload: { avatar_url: url },
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
  // The name goes in the payload because the approvals screen had only a uuid
  // to work with and so showed "Quitar miembro" and the proposer's name and
  // nothing else. Admins were approving a removal without being told who was
  // being removed. Snapshotted at proposal time, so the request says who was
  // meant even if that person later changes their display name.
  const { data: target } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle()
  const { error } = await supabase.from('change_requests').insert({
    club_id: clubId,
    kind: 'member_removal',
    payload: { user_id: userId, display_name: target?.display_name ?? null },
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

// The RPC raises in English, for whoever is reading a log: 'sign in first',
// 'invitation not found', 'this club is not open for join requests', 'already
// a member'. Returning error.message put those words on the member's screen
// verbatim, in a language the app had not chosen and a register nobody writes
// UI in. This is the one place that reads them, and anything unrecognised
// becomes the generic refusal rather than leaking whatever the database said
// next: the worst case is a vaguer message, never raw SQL.
//
// The literals below are the RPC's own, in supabase/migrations/0031. If one is
// reworded there, the mapping falls through to the default and this comment is
// where to look.
const JOIN_REFUSALS: Record<string, StringKey> = {
  'sign in first': 'club.join.signInFirst',
  'invitation not found': 'club.join.gone',
  'this club is not open for join requests': 'club.join.closed',
  'already a member': 'club.join.already',
}

export async function requestJoinClub(joinToken: string, _prev: string | null): Promise<string> {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('request_join_club', { jtoken: joinToken })
  if (error) {
    const { t } = await getT()
    return t(JOIN_REFUSALS[error.message.trim().toLowerCase()] ?? 'club.join.failed')
  }
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
    // The summary is read by the member, not by the admin who just clicked
    // approve, so it resolves in THEIR language. notify.ts already picks the
    // template that way; this variable had to be given the same treatment or
    // an English member got an English email with a Spanish clause inside it.
    const { data: reader } = await supabase.from('users').select('lang').eq('id', req.requested_by).maybeSingle()
    const readerLang = (reader?.lang as Lang | null) === 'en' ? 'en' : 'es'
    const key = CHANGE_REQUEST_SUMMARY[req.kind]
    await queueNotification(supabase, {
      userId: req.requested_by,
      template: approve ? 'change_request_approved' : 'change_request_declined',
      vars: { club: clubName, summary: key ? translate(readerLang, key) : req.kind },
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

// `lang` is bound, so it comes before formData: a form action receives
// formData last, and anything after it cannot be supplied by the form.
export async function updateNotificationTemplate(channel: 'email' | 'whatsapp', key: string, lang: 'es' | 'en', formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const subject = String(formData.get('subject') ?? '').trim() || null
  const body = String(formData.get('body') ?? '').trim()
  if (!body) throw new Error('empty body')
  const { error } = await supabase
    .from('notification_templates')
    .update({ subject, body, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
    .eq('channel', channel)
    .eq('key', key)
    // A key is one row per language now. Without this the update would touch
    // both and an admin editing the Spanish copy would silently overwrite the
    // English one with it.
    .eq('lang', lang)
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
  if (!me?.is_app_admin) throw new Error('app admins only')

  const { data: tpl } = await supabase
    .from('notification_templates')
    .select('body, wa_language')
    .eq('channel', 'whatsapp')
    .eq('key', key)
    // WhatsApp is Spanish-only: an English template there is a Meta
    // submission, not a row.
    .eq('lang', 'es')
    .maybeSingle()
  if (!tpl) throw new Error('no such template')

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
    .eq('lang', 'es')

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
  if (!me?.is_app_admin) throw new Error('app admins only')

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
      .eq('lang', 'es')
  }
  revalidatePath('/admin')
}

// returns an error string for the form to show inline, or redirects on success.
// (throwing would crash the page to a 500 and lose what the user typed.)
// A datetime-local input has no timezone, and this app is in one. new Date()
// parses it in the SERVER's zone, which is UTC on Vercel, so "6 ago, 9:00"
// meant to be 9am in Mexico City was stored as 09:00Z, six hours early. The
// deadline then fired a whole day before the organizer asked for it.
function mexicoLocalToIso(local: string) {
  // Mexico has not observed DST since 2022, so the offset is a constant.
  return local.length ? `${local}${local.length === 16 ? ':00' : ''}-06:00` : ''
}

export async function createEvent(
  clubId: string,
  clubSlug: string,
  _prev: string | null,
  formData: FormData
): Promise<string | null> {
  const { t } = await getT()
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return t('err.session')

  const title = String(formData.get('title') ?? '').trim()
  // Which pair of date fields is required depends on the mode, because the
  // other pair is not on the form at all: the window inputs unmount when the
  // organizer says they already know the date, so validating both always
  // rejected every fixed-time event with "faltan campos obligatorios".
  const fixedDate = String(formData.get('chosen_date') ?? '').trim()
  const wantsFixed = String(formData.get('sched_mode') ?? 'ask') === 'fixed'
  const startDate = String(formData.get('sched_start_date') ?? '')
  const endDate = String(formData.get('sched_end_date') ?? '')
  if (!title) return t('err.fields.missing')
  if (wantsFixed) {
    if (!fixedDate) return t('err.fields.missing')
  } else {
    if (!startDate || !endDate) return t('err.fields.missing')
    if (endDate < startDate) return t('err.dates.backwards')
  }

  const capacityRaw = String(formData.get('capacity') ?? '').trim()
  const deadlineRaw = String(formData.get('confirm_deadline') ?? '').trim()
  const categoryRaw = String(formData.get('category_id') ?? '')
  const { randomSlug } = await import('@/lib/slug')
  const slug = randomSlug()

  // Two ways in. "Preguntar al club" makes the event a question and the poll
  // decides the time; "ya sé la fecha" makes it scheduled on the spot. The
  // status was hardcoded to 'scheduling', so an organizer who already knew the
  // date had to create the poll and then pick a slot on the event page.
  //
  // The minutes-from-midnight selects are the same ones the window uses, and
  // the date is a plain `date` input, so both go through mexicoLocalToIso for
  // the same reason confirm_deadline does: this app is in one timezone and the
  // server is in another.
  const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  let chosenStart: string | null = null
  let chosenEnd: string | null = null
  if (wantsFixed && fixedDate) {
    const from = Number(formData.get('chosen_from') ?? 1140)
    const to = Number(formData.get('chosen_to') ?? 1380)
    chosenStart = new Date(mexicoLocalToIso(`${fixedDate}T${hhmm(from)}`)).toISOString()
    // an end before the start is the night running past midnight
    const endDay = to > from ? fixedDate : new Date(Date.parse(`${fixedDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
    chosenEnd = new Date(mexicoLocalToIso(`${endDay}T${hhmm(to)}`)).toISOString()
  }

  const { error } = await supabase.from('events').insert({
    club_id: clubId,
    category_id: categoryRaw || null,
    slug,
    title,
    location: String(formData.get('location') ?? '').trim() || null,
    ...readPoint(formData, 'location'),
    description: String(formData.get('description') ?? '').trim() || null,
    status: chosenStart ? 'scheduled' : 'scheduling',
    chosen_start: chosenStart,
    chosen_end: chosenEnd,
    scheduled_at: chosenStart ? new Date().toISOString() : null,
    organizer_user_id: user.id,
    join_policy: String(formData.get('join_policy') ?? 'club_members_only'),
    // The stepper's number is the answer; allow_guests stays in step with it
    // so nothing reading the old boolean starts letting guests in.
    allow_guests: !!readGuestCap(formData),
    max_guests_per_member: readGuestCap(formData),
    capacity: capacityRaw ? Number(capacityRaw) : null,
    waitlist_enabled: formData.get('waitlist_enabled') === 'on' && !!capacityRaw,
    confirm_deadline: deadlineRaw ? new Date(mexicoLocalToIso(deadlineRaw)).toISOString() : null,
    sched_start_date: startDate || null,
    sched_end_date: endDate || null,
    sched_time_min: Number(formData.get('time_min') ?? 1140),
    sched_time_max: Number(formData.get('time_max') ?? 1380),
    sched_slot_minutes: Number(formData.get('slot_minutes') ?? 60),
  })
  if (error) return t('err.event.create')

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
  const { t } = await getT()
  const supabase = await supabaseServer()
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return t('err.title.missing')

  const capacityRaw = String(formData.get('capacity') ?? '').trim()
  const deadlineRaw = String(formData.get('confirm_deadline') ?? '').trim()
  const categoryRaw = String(formData.get('category_id') ?? '')

  const patch: Record<string, unknown> = {
    title,
    category_id: categoryRaw || null,
    location: String(formData.get('location') ?? '').trim() || null,
    ...readPoint(formData, 'location'),
    join_policy: String(formData.get('join_policy') ?? 'club_members_only'),
    // The stepper's number is the answer; allow_guests stays in step with it
    // so nothing reading the old boolean starts letting guests in.
    allow_guests: !!readGuestCap(formData),
    max_guests_per_member: readGuestCap(formData),
    capacity: capacityRaw ? Number(capacityRaw) : null,
    waitlist_enabled: formData.get('waitlist_enabled') === 'on' && !!capacityRaw,
    confirm_deadline: deadlineRaw ? new Date(mexicoLocalToIso(deadlineRaw)).toISOString() : null,
  }

  if (formData.has('sched_start_date')) {
    const startDate = String(formData.get('sched_start_date') ?? '')
    const endDate = String(formData.get('sched_end_date') ?? '')
    if (!startDate || !endDate) return t('err.dates.missing')
    if (endDate < startDate) return t('err.dates.backwards')
    patch.sched_start_date = startDate
    patch.sched_end_date = endDate
    patch.sched_time_min = Number(formData.get('time_min') ?? 1140)
    patch.sched_time_max = Number(formData.get('time_max') ?? 1380)
    patch.sched_slot_minutes = Number(formData.get('slot_minutes') ?? 60)
  }

  const { error } = await supabase.from('events').update(patch).eq('id', eventId)
  if (error) return t('err.save')
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
  // One field on the form now, split here. Two fields made the organizer
  // decide the channel before typing, and '@' is the only reliable tell:
  // Mexican numbers are written with spaces, dashes, parentheses and an
  // optional +52, none of which appear in an address. Same rule sign-in uses.
  // The two old names still read, so an older form post still works.
  const contact = String(formData.get('contact') ?? '').trim()
  const typed = contact.includes('@')
  const email = (typed ? contact : String(formData.get('email') ?? '').trim()) || null
  const phone = (contact && !typed ? contact : String(formData.get('phone') ?? '').trim()) || null
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
  // Cancelling and closing both leave a mark on the event itself, so their
  // banners can say when and by whom rather than only that it happened. The
  // status RPC does not carry the actor, hence the second write.
  if (status === 'cancelled') {
    await supabase.from('events').update({ cancelled_at: new Date().toISOString() }).eq('id', eventId)
  }
  if (status === 'done') {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    await supabase
      .from('events')
      .update({ closed_at: new Date().toISOString(), closed_by: user?.id ?? null })
      .eq('id', eventId)
  }
  revalidatePath(`/e/${slug}`)
}

export async function addExpense(eventId: string, slug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const { parseMoneyToCents } = await import('@/lib/money')
  const cents = parseMoneyToCents(String(formData.get('amount') ?? ''))
  if (!cents) throw new Error('invalid amount')
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
  if (!note || !cents) throw new Error('note or amount missing')
  const { error } = await supabase.from('expenses').update({ note, amount_cents: cents }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

// A wrong expense could be edited but never removed: expenses_delete existed
// in RLS and nothing ever called it, so a duplicate or a mistyped one stayed
// on the event forever, skewing every balance under it.
//
// Deleting one that has already been settled would rewrite history someone
// paid against, so that is refused rather than done quietly.
export async function removeExpense(id: string, slug: string) {
  const { t } = await getT()
  const supabase = await supabaseServer()
  const { data: exp } = await supabase.from('expenses').select('event_id').eq('id', id).maybeSingle()
  if (!exp) return { ok: false as const, error: t('err.expense.gone') }

  const { count } = await supabase
    .from('settlements')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', exp.event_id)
    .eq('confirmed', true)
  if (count && count > 0) {
    return {
      ok: false as const,
      error: t('err.expense.paid'),
    }
  }

  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) return { ok: false as const, error: t('err.expense.delete') }
  revalidatePath(`/e/${slug}`)
  return { ok: true as const }
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
  const { t } = await getT()
  const supabase = await supabaseServer()

  // The amount and both parties arrived from the browser. RLS proves the
  // caller may write a settlement for this event, and the new trigger proves
  // they cannot forge `confirmed`, but nothing checked that the transfer is
  // one the books actually call for. So it is recomputed here from the same
  // balances the screen was drawn from: a claim has to match a suggested
  // transfer, and cannot exceed it.
  const { suggestTransfers, netOfPending } = await import('@/lib/settle')
  const [{ data: bal, error: balErr }, { data: pend }] = await Promise.all([
    supabase.from('event_balances').select('user_id, net_cents').eq('event_id', eventId),
    supabase
      .from('settlements')
      .select('from_user, to_user, amount_cents')
      .eq('event_id', eventId)
      .eq('confirmed', false),
  ])
  if (balErr) return { ok: false as const, error: t('err.balances.read') }

  const owed = suggestTransfers(netOfPending(bal ?? [], pend ?? [])).find(
    (tr) => tr.from.user_id === fromUser && tr.to.user_id === toUser
  )
  if (!owed) {
    return { ok: false as const, error: t('err.payment.settled') }
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > owed.amount_cents) {
    return { ok: false as const, error: t('err.payment.mismatch') }
  }

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
  // a second identical pending claim is the same payment submitted twice, and
  // the recipient could confirm both, crediting it twice over
  if (error?.code === '23505') {
    return { ok: false as const, error: t('err.payment.dupe') }
  }
  if (error) return { ok: false as const, error: t('err.payment.record') }

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
  return { ok: true as const }
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
  if (error || !poll) throw new Error(error?.message ?? 'poll create failed')

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
  if (!display_name) throw new Error('empty name')
  const avatar_kind = formData.get('avatar_kind') === 'photo' ? 'photo' : 'bug'
  const avatar_bug = String(formData.get('avatar_bug') ?? 'bug')
  const avatar_color = String(formData.get('avatar_color') ?? '').trim() || null
  const avatar_photo_url = ourStorageUrl(
    String(formData.get('avatar_photo_url') ?? '').trim() || null,
    'avatars'
  )
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
  const prefs: Record<string, { email: boolean; whatsapp: boolean; push: boolean }> = {}
  let anyEmail = false
  let anyWhatsapp = false
  for (const t of NOTIF_TOPICS) {
    const email = formData.get(`t_${t.key}_email`) === 'on'
    const whatsapp = formData.get(`t_${t.key}_whatsapp`) === 'on'
    const push = formData.get(`t_${t.key}_push`) === 'on'
    prefs[t.key] = { email, whatsapp, push }
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
export async function startWhatsappVerification(formData: FormData) {
  const { t } = await getT()
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const phone = normalizePhone(String(formData.get('phone') ?? '').trim())
  if (!phone) return { ok: false as const, error: t('err.phone.tenDigits') }
  return startPhoneChange(user.id, phone)
}

// The number only reaches the account here, once a code sent to it comes
// back. Saving on sight was fine while this was a delivery address and is not
// now that it is a way to sign in.
export async function confirmWhatsappVerification(code: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const res = await confirmPhoneChange(user.id, code)
  if (res.ok) revalidatePath('/account')
  return res
}

// Removing the number gives up a way in, which the confirm copy has to say.
export async function removeWhatsappPhone() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const { error } = await supabase
    .from('users')
    .update({ phone_whatsapp: null, phone_verified_at: null })
    .eq('id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/account')
}

export async function savePaymentMethods(formData: FormData) {
  const { t } = await getT()
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

  // One transaction. This used to delete every row and then insert, with the
  // delete unchecked, so any insert failure (kind comes from the form against
  // a CHECK constraint) left you with no payment methods at all.
  const { error } = await supabase.rpc('replace_payment_methods', {
    rows: rows.map((r) => ({ kind: r.kind, value: r.value })),
  })
  if (error) {
    return {
      ok: false as const,
      error:
        error.code === '23514'
          ? t('err.pay.unknownKind')
          : t('err.pay.save'),
    }
  }
  revalidatePath('/account')
  return { ok: true as const }
}

// "Eliminar cuenta" used to mean "set status to disabled", and disabled meant
// nothing at all: the account kept every club it ran, its number still signed
// it in, and its email, payment details and saved addresses stayed in the
// table. The RPC does the scrubbing now (0031); this closes the auth side.
//
// The auth user is banned rather than deleted. public.users.id references
// auth.users on delete cascade, so deleting it would take the profile row with
// it, and every RSVP, expense and settlement hanging off that row: other
// people's records, and the money history of events that already happened. A
// ban stops sessions being issued without rewriting anyone's past.
export async function requestAccountDeletion(formData: FormData) {
  if (String(formData.get('confirm') ?? '') !== 'DELETE') {
    throw new Error('type DELETE to confirm')
  }
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const { error } = await supabase.rpc('request_account_deletion')
  if (error) throw new Error(error.message)

  // A hundred years. Supabase has no "forever", and a duration that outlives
  // the app is the same thing in practice.
  const admin = supabaseService()
  if (admin) await admin.auth.admin.updateUserById(user.id, { ban_duration: '876000h' })

  await supabase.auth.signOut()
  redirect('/')
}

// A saved place needs both halves. The name is what a member recognises in
// the picker and the address is what gets anybody there, so a row with one of
// them is half a place: "Casa de Marta" with no address routes nowhere, and a
// bare street with no name is unrecognisable in a list of five.
//
// The form used to fill the gap silently, copying the address into the name
// when the name was blank, so saving with one field filled produced a saved
// place and looked like it had worked.
function readPlace(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  const addr = String(formData.get('addr') ?? '').trim()
  return {
    ok: !!name && !!addr,
    row: { name, addr, query: addr, ...readPoint(formData, 'addr') },
  }
}

// The pin the organizer dropped, read off the LocationPicker's two hidden
// fields. Both or neither, which is what the check constraint on the table
// says too: one of the two alone puts a marker on the equator.
// How many each member may bring. Absent means the organizer never opened
// that block, which is "none" and not "one".
function readGuestCap(formData: FormData): number | null {
  const raw = formData.get('max_guests_per_member')
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.round(n)) : null
}

function readPoint(formData: FormData, field: string) {
  const lat = Number(formData.get(`${field}_lat`))
  const lng = Number(formData.get(`${field}_lng`))
  const ok = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
  // The street the pin landed on, resolved in the picker so it is saved with
  // the point that produced it. Without the point it is meaningless, so it
  // travels with it or not at all.
  const area = String(formData.get(`${field}_area`) ?? '').trim()
  return { lat: ok ? lat : null, lng: ok ? lng : null, area: ok && area ? area : null }
}

export async function addSavedPlace(formData: FormData) {
  const { t } = await getT()
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { ok, row } = readPlace(formData)
  if (!ok) return { ok: false as const, error: t('err.place.incomplete') }
  const { error } = await supabase.from('saved_places').insert({ user_id: user.id, ...row })
  if (error) throw new Error(error.message)
  revalidatePath('/account')
  return { ok: true as const }
}

// Editing rather than delete-and-retype. A saved place is mostly right when
// it is wrong: the pin is a street off, or the name changed when the club
// started calling it something else.
export async function updateSavedPlace(id: string, formData: FormData) {
  const { t } = await getT()
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { ok, row } = readPlace(formData)
  if (!ok) return { ok: false as const, error: t('err.place.incomplete') }
  // RLS already scopes this to the owner; the filter says so out loud.
  const { error } = await supabase.from('saved_places').update(row).eq('id', id).eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/account')
  return { ok: true as const }
}

export async function removeSavedPlace(id: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('saved_places').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/account')
}

// Post-event roll call. Writes through mark_attendance (SECURITY DEFINER)
// rather than a widened RLS policy, so an organizer can record who came
// without gaining the ability to rewrite what people answered.
export async function markAttendance(
  eventId: string,
  slug: string,
  presentUserIds: string[],
  presentGuestIds: string[] = []
) {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('mark_attendance', {
    eid: eventId,
    present: presentUserIds,
    present_guests: presentGuestIds,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
  revalidatePath('/plate')
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
export async function duplicateEvent(eventId: string, extraWeeks = 0) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const { data: src } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle()
  if (!src) throw new Error('event not found')

  const { randomSlug } = await import('@/lib/slug')
  const slug = randomSlug()

  // One function decides which week this lands in, because the confirmation
  // modal already told the organizer which week it would be.
  const { duplicateWindow } = await import('@/lib/duplicate-window')
  const { sched_start_date, sched_end_date } = src as { sched_start_date: string | null; sched_end_date: string | null }
  const win = duplicateWindow(sched_start_date, sched_end_date, extraWeeks)
  const startDate = win?.start ?? sched_start_date
  const endDate = win?.end ?? sched_end_date

  const { data: created, error } = await supabase
    .from('events')
    .insert({
      club_id: src.club_id,
      category_id: src.category_id,
      duplicated_from: eventId,
      slug,
      title: src.title,
      location: src.location,
      description: src.description,
      status: 'scheduling',
      organizer_user_id: user.id,
      join_policy: src.join_policy,
      allow_guests: src.allow_guests,
      max_guests_per_member: src.max_guests_per_member,
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
  if (error || !created) throw new Error('duplicate failed')

  const { data: items } = await supabase
    .from('contributions')
    .select('title, qty, kind')
    .eq('event_id', eventId)
  if (items?.length) {
    const { error: itemsError } = await supabase.from('contributions').insert(
      items.map((i) => ({
        event_id: created.id,
        title: i.title,
        qty: i.qty,
        kind: i.kind,
        created_by: user.id,
        assigned_to: null,
      }))
    )
    // This was unchecked, which made the worst outcome the quiet one: an
    // event created without the bring list that was the whole reason to
    // duplicate, and nobody told. Undo the event instead of leaving half a
    // copy, so the result is either the whole thing or nothing at all.
    if (itemsError) {
      await supabase.from('events').delete().eq('id', created.id)
      throw new Error('bring-list copy failed, event not created')
    }
  }

  // a duplicate is a new event to everyone else, so the club hears about it
  // on the same terms as one created from scratch
  const [{ data: fellows }, { data: creator }, { data: clubRow }] = await Promise.all([
    supabase.from('club_members').select('user_id').eq('club_id', src.club_id).neq('user_id', user.id),
    supabase.from('users').select('display_name').eq('id', user.id).single(),
    supabase.from('clubs').select('name').eq('id', src.club_id).single(),
  ])
  const link = `${siteUrl()}/e/${slug}`
  // The event exists by now. A notification that fails to queue is a problem
  // for the outbox to show, not a reason to tell the organizer their event
  // was not created, which is what an uncaught throw here used to do.
  try {
    for (const m of fellows ?? []) {
      await queueNotification(supabase, {
        userId: m.user_id,
        template: 'new_event',
        vars: { creator: creator?.display_name ?? 'Alguien', title: src.title, club: clubRow?.name ?? 'tu club', link },
      })
    }
  } catch (e) {
    console.error('[duplicateEvent] could not queue the notices', e)
  }
  dispatchAfterResponse(supabase)
  redirect(`/e/${slug}`)
}

// Resend an invitation that has not been claimed. Same token, same link, so
// an invite that is sitting in someone's inbox twice still leads to one
// account. Only the email channel resends: a WhatsApp-only invitation has
// nothing to send to until Meta approves an invitation template.
export async function resendInvitation(invitationId: string, path: string) {
  const { t } = await getT()
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const { data: inv } = await supabase
    .from('invitations')
    .select('token, email, phone, club_id, event_id, claimed_by_user_id, declined_at')
    .eq('id', invitationId)
    .maybeSingle()
  if (!inv) throw new Error('invitation not found')
  if (inv.claimed_by_user_id) return { ok: false as const, error: t('err.invite.used') }
  // they answered. Resending would be asking the same question again.
  if (inv.declined_at) return { ok: false as const, error: t('err.invite.declined') }
  if (!inv.email && !inv.phone) return { ok: false as const, error: t('err.invite.noDestination') }

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

  // Resending revives the link. The token is the same one, so anything already
  // forwarded keeps working, which is what "resend" means to the person doing
  // it; killing the old one is what "revocar" is for.
  if (result.ok) {
    await supabase
      .from('invitations')
      .update({ last_sent_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() })
      .eq('id', invitationId)
  }

  revalidatePath(path)
  if (!result.ok) return { ok: false as const, error: result.error ?? t('err.invite.resend') }
  return { ok: true as const }
}

// Step one of signing in: send the code, over whichever channel the member
// typed. Unauthenticated by definition, so a number is normalized here rather
// than trusted from the client, and neither channel ever reports whether that
// contact has an account.
//
// An address is lowercased for the same reason a number is normalized: people
// type Ana@Correo.com and the column holds ana@correo.com, and without this
// that sign-in silently finds nobody and reports success, which is
// indistinguishable from a mail server being slow.
export async function requestSigninCodeFor(raw: string) {
  const value = raw.trim()
  if (value.includes('@')) return requestSigninCode(value.toLowerCase())
  const phone = normalizePhone(value)
  if (!phone) {
    const { t } = await getT()
    return { ok: false as const, error: t('auth.phoneIncomplete') }
  }
  return requestSigninCode(phone)
}

// Step two: check the code and open the session. Returns where to go next
// rather than redirecting, so the form can show an error in place when the
// code is wrong instead of navigating away from what the member typed.
export async function verifySigninCodeFor(raw: string, code: string, next?: string | null) {
  const value = raw.trim()
  if (value.includes('@')) return verifySigninCode(value.toLowerCase(), code, next)
  const phone = normalizePhone(value)
  if (!phone) {
    const { t } = await getT()
    return { ok: false as const, error: t('auth.phoneIncompleteShort') }
  }
  return verifySigninCode(phone, code, next)
}

// The organizer's nudge from the grid: whoever has not painted anything yet.
export async function remindMissingAvailability(eventId: string, slug: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const queued = await nudgeMissingAvailability(supabase, eventId)
  dispatchAfterResponse(supabase)
  revalidatePath(`/e/${slug}`)
  return { queued }
}

// The event thread. Deliberately not a chat: it belongs to one event, dies
// with it, and never becomes a place anyone has to keep up with. RLS decides
// who may post (event members) and who may remove (the author, or an
// organizer moderating), so these only carry the write.
export async function addComment(eventId: string, slug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const body = String(formData.get('body') ?? '').trim()
  if (!body) return
  const { error } = await supabase
    .from('event_comments')
    .insert({ event_id: eventId, user_id: user.id, body: body.slice(0, 2000) })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

export async function removeComment(commentId: string, slug: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('event_comments').delete().eq('id', commentId)
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
}

// Deleting an event is reversible for 30 days. Cancelling already exists and
// means something different: the event happened as a plan and did not happen
// in fact. Deleting means it should never have been here, and it takes
// attendance, expenses and a settled history with it, which is why it waits.
//
// A club admin does it. An organizer proposes it and an admin decides, the
// same dance as categories and member removal.
export async function setEventDeleted(eventId: string, slug: string, deleted: boolean) {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('set_event_deleted', { eid: eventId, deleted })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
  revalidatePath('/events')
}

export async function requestEventDeletion(eventId: string, slug: string, restore: boolean) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { data: ev } = await supabase.from('events').select('club_id, title').eq('id', eventId).maybeSingle()
  if (!ev?.club_id) throw new Error('event has no club')
  const { error } = await supabase.from('change_requests').insert({
    club_id: ev.club_id,
    kind: restore ? 'event_restore' : 'event_delete',
    requested_by: user.id,
    payload: { event_id: eventId, title: ev.title },
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/e/${slug}`)
  return { ok: true as const }
}

// "Later" on a plate row: gone until tomorrow morning, then back, because the
// thing it points at is still owed. A dismissal would let a debt disappear
// because somebody was busy on a Tuesday.
export async function snoozePlateItem(itemKey: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const tomorrow = new Date()
  tomorrow.setHours(24, 0, 0, 0)
  const { error } = await supabase
    .from('plate_snoozes')
    .upsert({ user_id: user.id, item_key: itemKey, until: tomorrow.toISOString() })
  if (error) throw new Error(error.message)
  revalidatePath('/plate')
  revalidatePath('/')
}

// "Ya casi": someone stuck in the waiting room asking the admins to look.
//
// Once a day, at most. The screen already told them we know they arrived, so
// the value is agency rather than volume, and a queue of one person hitting a
// button repeatedly is what would make admins stop reading the notification.
//
// The whole thing is one RPC because the limit has to be atomic. It used to be
// a read-only check here plus inserts over the network, so two taps inside the
// round trip both passed and every admin got the message twice.
export async function nudgeAdmins() {
  const supabase = await supabaseServer()
  const { data, error } = await supabase.rpc('nudge_admins')
  if (error) throw new Error(error.message)
  const queued = (data as number | null) ?? 0
  if (queued > 0) dispatchAfterResponse(supabase)
  revalidatePath('/pending')
  return { ok: true as const, already: queued === 0 }
}

// Rotating the club's calendar link. The RPC checks club admin; this only
// carries the result back to the page so the new URL is on screen at once.
export async function rotateClubCalendarToken(clubId: string, clubSlug: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.rpc('rotate_club_calendar_token', { cid: clubId })
  if (error) throw new Error(error.message)
  revalidatePath(`/club/${clubSlug}`)
}

// The album. The upload lands under <event_id>/<uploader_id>/ so the storage
// policies can enforce "your own, or any if you organize" without a lookup,
// and the row is what the grid actually reads: storage cannot say who added a
// photo or be filtered by RLS the way the rest of the app is.
export async function addEventPhoto(eventId: string, slug: string, formData: FormData) {
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('no image in the form')
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')

  const { path } = await uploadToBucket('event-photos', `${eventId}/${user.id}/${Date.now()}.jpg`, file)
  const { error } = await supabase
    .from('event_photos')
    .insert({ event_id: eventId, uploaded_by: user.id, path })
  if (error) {
    // the object is already up; leaving it there would be a file nothing points
    // at, invisible to the grid and to the person who uploaded it
    await supabase.storage.from('event-photos').remove([path])
    throw new Error(error.message)
  }
  revalidatePath(`/e/${slug}`)
}

// Removing takes the row and the object. RLS decides whether this caller may:
// the row policy and the object policy carry the same rule, so a refusal from
// either is the same answer.
export async function removeEventPhoto(photoId: string, slug: string) {
  const supabase = await supabaseServer()
  const { data: photo } = await supabase.from('event_photos').select('path').eq('id', photoId).maybeSingle()
  if (!photo) return
  const { error } = await supabase.from('event_photos').delete().eq('id', photoId)
  if (error) throw new Error(error.message)
  await supabase.storage.from('event-photos').remove([photo.path])
  revalidatePath(`/e/${slug}`)
}

// Push subscriptions. One per browser per machine, so this is an upsert on the
// endpoint: re-subscribing the same browser must refresh the row rather than
// collect duplicates that all ring at once.
export async function savePushSubscription(sub: {
  endpoint: string
  p256dh: string
  auth: string
  deviceLabel: string
}) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      device_label: sub.deviceLabel,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw new Error(error.message)
  revalidatePath('/account')
}

// Turning it off on this device. The browser's own unsubscribe happens client
// side; this drops the row so nothing is sent to an endpoint nobody is
// listening on.
export async function removePushSubscription(endpoint: string) {
  const supabase = await supabaseServer()
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw new Error(error.message)
  revalidatePath('/account')
}

// "Send one to this device", from the account screen. The only way to answer
// "is this actually working" without waiting for somebody to create an event.
export async function sendTestPush(endpoint: string) {
  const { t } = await getT()
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { data: sub } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('endpoint', endpoint)
    .maybeSingle()
  if (!sub) return { ok: false as const, error: t('err.push.unregistered') }

  const { sendPush } = await import('@/lib/push')
  const result = await sendPush(sub, {
    title: 'Hive',
    body: t('push.test.body'),
    url: '/account',
    tag: 'test',
  })
  if (result.ok) return { ok: true as const }
  if (result.gone) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    return { ok: false as const, error: t('err.push.blocked') }
  }
  return { ok: false as const, error: result.error }
}

// The language override from Tú. Null means follow the phone, which is what
// most people should stay on: the app reads Accept-Language on the server and
// navigator.language in the browser, and both land in the same place.
export async function setLanguage(lang: 'es' | 'en' | null) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const { error } = await supabase.from('users').update({ lang }).eq('id', user.id)
  if (error) throw new Error(error.message)
  // Every screen renders in this language, so every screen is stale.
  revalidatePath('/', 'layout')
}
