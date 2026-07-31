'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'

// Declining without an account.
//
// Requiring someone to sign up in order to say no is a way of not letting
// them, and the organizer pays for it: an unanswered invitation looks exactly
// like an unopened one, so they keep chasing someone who already decided.
// Holding the token is the proof here, same as claiming, and the RPC refuses
// to touch an invitation that has already been claimed.
export async function declineInvitation(token: string, undo = false) {
  const supabase = await supabaseServer()
  const { data, error } = await supabase.rpc('decline_invitation', {
    invite_token: token,
    undo,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/i/${token}`)
  return { ok: data === true }
}

// Accepting, on purpose.
//
// This used to happen during the page's own render: a signed-in visitor who
// opened the link was joined to the club before the screen had drawn. GET
// navigation carries none of a server action's CSRF protection, so sending
// someone an invite link silently made them a member of your club, which then
// exposed their name, correo and WhatsApp to you through the roster.
//
// Joining a group of people is a decision, so now it takes a tap.
export async function acceptInvitation(token: string) {
  const supabase = await supabaseServer()
  const { data, error } = await supabase.rpc('claim_invitation', { invite_token: token })
  if (error) return { ok: false as const, error: error.message }
  const t = (data ?? {}) as { event_slug: string | null; club_slug: string | null }
  redirect(t.event_slug ? `/e/${t.event_slug}` : t.club_slug ? `/club/${t.club_slug}` : '/')
}
