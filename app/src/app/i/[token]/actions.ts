'use server'

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
