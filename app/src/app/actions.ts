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
