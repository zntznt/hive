'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { supabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { useLang, useT, useTf } from '@/components/ui/LangProvider'
import { fmtDateTime } from '@/lib/time'
import { Input } from '@/components/ui/Input'
import { Icon, type IconName } from '@/components/ui/Icon'
import { BrandMark } from '@/components/ui/BrandMark'
import { BeeLoader } from '@/components/ui/BeeLoader'
import { authOrigin } from '@/lib/site-url'
import { declineInvitation, acceptInvitation } from './actions'

type Props = {
  token: string
  clubName: string | null
  eventTitle: string | null
  inviter: string | null
  presetEmail: string | null
  phoneOnly: boolean
  when: string | null
  where: string | null
  going: number | null
  capacity: number | null
  declined: boolean
  expired: boolean
  signedIn: boolean
  claimed: boolean
  claimedByMe: boolean
  goHref: string
}

function Fact({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon name={icon} size={13} className="mt-[3px] shrink-0 text-honey-700" />
      <span className="text-[13.5px] leading-snug text-ink-700">{children}</span>
    </li>
  )
}

export default function InviteSignIn({
  token,
  clubName,
  eventTitle,
  inviter,
  presetEmail,
  phoneOnly,
  when,
  where,
  going,
  capacity,
  declined,
  expired,
  signedIn,
  claimed,
  claimedByMe,
  goHref,
}: Props) {
  const tr = useT()
  const tf = useTf()
  const lang = useLang()
  const [email, setEmail] = useState(presetEmail ?? '')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDeclined, setDeclined] = useState(declined)
  const [saying, startSaying] = useTransition()
  const [joining, startJoining] = useTransition()
  const [joinError, setJoinError] = useState<string | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    setError(null)
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${authOrigin()}/auth/callback?next=${encodeURIComponent(`/i/${token}`)}`,
        data: { invite_token: token },
      },
    })
    setSending(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  const say = (no: boolean) =>
    startSaying(async () => {
      await declineInvitation(token, !no)
      setDeclined(no)
    })

  const join = () =>
    startJoining(async () => {
      const res = await acceptInvitation(token)
      // a successful accept redirects, so anything returned here is a refusal
      if (res && !res.ok) setJoinError(res.error)
    })

  const headerTitle = eventTitle ?? clubName ?? 'Hive'
  // A room with a number on it. Nobody decides on "te invitaron", they decide
  // on when, where and who else va, so those go above the sign-in instead of
  // behind it.
  const spots = capacity != null && going != null ? capacity - going : null
  const sentTo = tr('inv.sentTo').split('{email}')

  return (
    <main className="mx-auto flex min-h-screen max-w-entry flex-col justify-center px-4 pb-10 pt-6">
      <div className="overflow-hidden rounded-2xl border border-line-card shadow-raised">
        <div
          className="border-b border-line-card px-[26px] pb-[22px] pt-7"
          style={{ backgroundImage: 'var(--honeycomb)', backgroundColor: 'var(--cream)' }}
        >
          <div className="mb-4">
            <BrandMark size="sm" showWordmark={false} />
          </div>
          <p className="eyebrow text-honey-700">{tr('inv.youWere')}</p>
          <h1 className="mt-1 font-display text-[26px] font-bold leading-tight text-ink-900">{headerTitle}</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            {eventTitle && clubName
              ? inviter
                ? tf('inv.sub.eventClub.by', { name: inviter, club: clubName })
                : tf('inv.sub.eventClub', { club: clubName })
              : inviter
                ? tf('inv.sub.by', { name: inviter })
                : tr('inv.sub')}
          </p>

          {eventTitle && !expired && (
            <ul className="mt-4 flex flex-col gap-2 border-t border-line-divider pt-3.5">
              {/* The date is `fmtDateTime`'s job. This screen used to build its
                  own Intl formatter with 'es-MX' hardcoded and the timezone
                  written out a second time, so an English reader got a Spanish
                  weekday and the app's clock had two places to change. */}
              <Fact icon="calendar-day">
                {when ? fmtDateTime(when, lang) : tr('invite.findingDate')}
              </Fact>
              <Fact icon="location-dot">{where || tr('invite.noPlace')}</Fact>
              <Fact icon="users">
                {going ? (going === 1 ? tf('invite.goingOne', { n: going }) : tf('invite.goingMany', { n: going })) : tr('invite.nobodyYet')}
                {capacity != null && (
                  <span className="text-ink-500">
                    {' · '}
                    {spots! > 0
                      ? spots === 1
                        ? tf('invite.spotsOne', { capacity })
                        : tf('invite.spotsMany', { n: spots!, capacity })
                      : tf('invite.full', { capacity })}
                  </span>
                )}
              </Fact>
            </ul>
          )}
        </div>

        <div className="bg-paper px-[26px] py-[26px]">
          {expired ? (
            <div className="flex flex-col gap-3.5">
              <h2 className="font-display text-xl font-bold text-ink-900">{tr('inv.tooLate')}</h2>
              <p className="text-sm text-ink-500">
                {inviter ? tf('invite.expired.by', { name: inviter }) : tr('invite.expired')}
              </p>
            </div>
          ) : claimedByMe ? (
            /* your own invitation, reopened. Asking "¿te unes?" to someone who
               joined a month ago is the app not knowing who it is talking to. */
            <div className="flex flex-col gap-3.5">
              <h2 className="font-display text-xl font-bold text-ink-900">{tr('inv.alreadyIn')}</h2>
              <p className="text-sm text-ink-500">
                {clubName ? tf('inv.alreadyIn.club', { club: clubName }) : tr('inv.alreadyIn.hint')}
              </p>
              <Link href={goHref} className="block">
                <Button display block size="lg">
                  {tr(eventTitle ? 'inv.goEvent' : 'inv.goClub')}
                </Button>
              </Link>
            </div>
          ) : claimed ? (
            <div className="flex flex-col gap-3.5">
              <h2 className="font-display text-xl font-bold text-ink-900">{tr('inv.used')}</h2>
              <p className="text-sm text-ink-500">
                {inviter ? tf('inv.used.by', { name: inviter }) : tr('inv.used.hint')}
              </p>
            </div>
          ) : signedIn ? (
            /* Opening the link is not the same as joining. This used to happen
               on page load, so anyone could add a signed-in stranger to their
               club by getting them to follow a URL. */
            <div className="flex flex-col gap-3.5">
              <h2 className="font-display text-xl font-bold text-ink-900">
                {clubName ? tf('inv.joinClub?', { club: clubName }) : tr('invite.accept?')}
              </h2>
              <p className="text-sm text-ink-500">
                {clubName ? tf('inv.signedIn.club', { club: clubName }) : tr('inv.signedIn.event')}
              </p>
              <Button display block size="lg" disabled={joining} onClick={join}>
                {joining ? tr('invite.oneMoment') : tr('invite.accept')}
              </Button>
              {joinError && <p className="rounded-md bg-danger-bg p-3 text-xs text-danger">{joinError}</p>}
              {/* signed in and already said no: accepting is itself the undo,
                  but the screen should not pretend the no never happened */}
              <button
                type="button"
                disabled={saying}
                onClick={() => say(!isDeclined)}
                className="tap mx-auto text-[13px] font-bold text-ink-500 underline decoration-line-input underline-offset-4 disabled:opacity-50"
              >
                {saying ? tr('invite.oneMoment') : tr(isDeclined ? 'invite.saidNo' : 'invite.cant')}
              </button>
            </div>
          ) : isDeclined ? (
            <div className="flex flex-col gap-3.5">
              <h2 className="font-display text-xl font-bold text-ink-900">{tr('inv.noted')}</h2>
              <p className="text-sm text-ink-500">
                {inviter ? tf('invite.declined.by', { name: inviter }) : tr('invite.declined')}
              </p>
              <Button variant="secondary" block disabled={saying} onClick={() => say(false)}>
                {saying ? tr('invite.oneMoment') : tr('invite.changedMind')}
              </Button>
            </div>
          ) : sent ? (
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-bold text-ink-900">{tr('signin.checkEmail')}</h2>
              {/* One sentence in the table, split on its slot so the address
                  can still be bold. The translator owns the whole sentence and
                  can put {email} wherever their language wants it. */}
              <p className="text-sm text-ink-500">
                {sentTo[0]}
                <b className="text-honey-700">{email}</b>
                {sentTo[1]}
              </p>
              <BeeLoader />
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-ink-700">{tr('inv.emailIntro')}</p>
              <form onSubmit={send} className="flex flex-col gap-3.5">
                {phoneOnly && (
                  <p className="rounded-md bg-cream-sunk p-3 text-xs text-ink-500">
                    {tr('inv.phoneOnly')}
                  </p>
                )}
                <Input
                  id="email"
                  type="email"
                  required
                  label={tr('inv.yourEmail')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={tr('inv.email.example')}
                />
                <Button display block size="lg" disabled={sending}>
                  {sending ? tr('common.sending') : tr('invite.accept')}
                </Button>
                {error && <p className="rounded-md bg-danger-bg p-3 text-xs text-danger">{error}</p>}
                <p className="pt-0.5 text-center text-[11.5px] text-ink-300">
                  {clubName ? tf('inv.acceptJoins', { club: clubName }) : tr('invite.noForms')}
                </p>
              </form>

              {/* Saying no should not cost an account. An invitation nobody
                  answered looks exactly like one nobody opened, so the
                  organizer keeps chasing someone who already decided. */}
              <div className="mt-4 border-t border-line-divider pt-4 text-center">
                <button
                  type="button"
                  disabled={saying}
                  onClick={() => say(true)}
                  className="min-h-11 cursor-pointer px-3 text-[13px] font-bold text-ink-500 underline decoration-line-input underline-offset-4 disabled:opacity-50"
                >
                  {tr(saying ? 'invite.telling' : 'invite.cant')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
