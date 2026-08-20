import { HexAvatar } from '@/components/ui/HexAvatar'
import { Icon } from '@/components/ui/Icon'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { signOut } from '../actions'
import { Button } from '@/components/ui/Button'
import { BugAvatar } from '@/components/ui/BugAvatar'
import { BeeLoader } from '@/components/ui/BeeLoader'
import NudgeAdmins from './nudge-admins'
import { getT } from '@/lib/current-lang'
import { nameList } from '@/lib/event-line'

export default async function PendingPage() {
  const { t: tr, tf, lang } = await getT()
  const supabase = await supabaseServer()
  const { data: claimsData } = await supabase.auth.getClaims()
  const uid = claimsData?.claims?.sub
  if (!uid) redirect('/')
  const { data: profile } = await supabase
    .from('users')
    .select('display_name, status')
    .eq('id', uid)
    .single()
  if (profile?.status === 'active') redirect('/')

  const disabled = profile?.status === 'disabled'

  // Who is actually reviewing, and how many people are ahead. A wait with a
  // name and a number on it is a queue; a spinner is a void.
  //
  // Both facts live in rows this account cannot read (users_select scopes a
  // non-admin to themselves plus their clubs, and someone waiting for approval
  // is in none), so they come from a definer function that returns those
  // facts and nothing else.
  const { data: queue } = disabled ? { data: null } : await supabase.rpc('pending_queue_status')
  const status = (queue?.[0] ?? null) as {
    reviewers: string[] | null
    ahead: number | null
    nudged_recently: boolean | null
  } | null
  const names = (status?.reviewers ?? []).slice(0, 3)
  const ahead = status?.ahead ?? null
  const nudgedRecently = status?.nudged_recently === true

  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-entry text-center">
        <div className="mb-4.5 flex justify-center">
          {/* Two states share this screen and they are not the same news.
              Waiting for approval is a queue: honey, and it moves. Desactivada
              is not a place in line, so it does not get the queue's title, its
              color, or its loader. */}
          <BugAvatar bug="bug" size={68} color={disabled ? 'var(--cream-sunk)' : 'var(--honey-300)'} />
        </div>
        <h1 className="font-display text-xl font-bold text-ink-900">
          {disabled ? tr('pending.disabled') : tr('pending.title')}
        </h1>
        <p className="mt-2.5 text-sm text-ink-500">
          {disabled
            ? tr('pending.disabled.body')
            : tr('pending.body')}
        </p>
        {!disabled && (
          <>
            {/* A card with the reviewer in it, left aligned, rather than two
                more centred sentences. The wait is a queue with people in it,
                and a hexagon is what says so. */}
            <div className="mt-3.5 flex flex-col gap-2.5 rounded-lg border border-line-card bg-paper p-4 text-left">
              <div className="flex items-center gap-2.5">
                {names.length > 0 ? (
                  <HexAvatar name={names[0]} size={28} />
                ) : (
                  <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-cream-sunk text-ink-500">
                    <Icon name="users" size={13} />
                  </span>
                )}
                <span className="min-w-0 flex-1 text-[13.5px] text-ink-700">
                  {names.length === 1
                    ? tf('pending.reviewer1', { name: names[0] })
                    : names.length > 1
                      ? tf('pending.reviewers', { names: nameList(names, names.length, lang) })
                      : tr('pending.reviewerAny')}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-cream-sunk text-ink-500">
                  <Icon name="hourglass-half" size={13} />
                </span>
                <span className="min-w-0 flex-1 text-[13.5px] text-ink-700">
                  {ahead != null && ahead > 0
                    ? ahead === 1
                      ? tr('pending.ahead1')
                      : tf('pending.aheadN', { n: ahead })
                    : tr('pending.youreNext')}
                </span>
              </div>
            </div>
            <div className="mb-5.5 mt-5">
              <BeeLoader label={tr('pending.buzz')} />
            </div>
            <div className="mb-5">
              <NudgeAdmins alreadyNudged={nudgedRecently} />
            </div>
          </>
        )}
        <form action={signOut} className={disabled ? 'mt-6' : undefined}>
          <Button variant="secondary">{tr('danger.signout')}</Button>
        </form>
      </div>
    </main>
  )
}
