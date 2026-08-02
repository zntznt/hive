'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markAttendance } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { useT, useTf } from '@/components/ui/LangProvider'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { FaceStack } from '@/components/ui/FaceStack'
import { timeAgo } from '@/lib/relative-time'
import { useLang } from '@/components/ui/LangProvider'

// Post-event roll call, organizers only, and only once the event is done.
// An RSVP is a promise; this is the record, and it is what the club roster's
// attendance count reads.
//
// Everyone who said "voy" starts present. The common case is that everybody
// came, so starting empty would turn a fifteen second chore into eleven taps
// and the feature would go unused: the organizer taps the misses instead, and
// a clean event costs two taps.
//
// A guest counts towards the event and never towards a member's own record.
// That separation is free: attendance_stats groups by rsvps.user_id, and a
// guest has no row there.

export type RollCallPerson = {
  key: string
  name: string
  user: AvatarUser
  // set for a "+1": who brought them
  guestOf?: string
  present: boolean
}

export function AttendanceSheet({
  eventId,
  slug,
  people,
  takenAt,
  takenBy,
}: {
  eventId: string
  slug: string
  people: RollCallPerson[]
  takenAt: string | null
  takenBy: string | null
}) {
  const lang = useLang()
  const tf = useTf()
  const tr = useT()
  const [taking, setTaking] = useState(false)
  const [present, setPresent] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(people.map((p) => [p.key, p.present]))
  )
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const toast = useToast()

  const total = people.length
  const came = people.filter((p) => present[p.key]).length
  const absent = people.filter((p) => !p.present)

  function open() {
    setPresent(Object.fromEntries(people.map((p) => [p.key, p.present])))
    setError(null)
    setTaking(true)
  }

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        const users = people.filter((p) => !p.guestOf && present[p.key]).map((p) => p.key)
        const guests = people.filter((p) => p.guestOf && present[p.key]).map((p) => p.key)
        await markAttendance(eventId, slug, users, guests)
        setTaking(false)
        toast(tr('roll.saved'))
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : tr('event.rollcall.failed'))
      }
    })
  }

  // Nobody said they were coming, so there is no list to pass.
  if (total === 0 && !takenAt) return null

  // --- 2. being taken ------------------------------------------------------
  if (taking) {
    const setAll = (v: boolean) => setPresent(Object.fromEntries(people.map((p) => [p.key, v])))
    return (
      <div className="overflow-hidden rounded-md border border-line-card bg-paper shadow-card">
        <div className="flex items-center justify-between gap-2.5 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold leading-tight text-ink-900">
              {came} de {total} {came === 1 ? 'vino' : 'vinieron'}
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-500">{tr('event.rollcall.tap')}</p>
          </div>
          <span className="flex flex-shrink-0 items-center gap-1">
            <button type="button" onClick={() => setAll(true)} className="tap px-1 text-[12.5px] font-bold text-honey-700">
              {tr('roll.allCame')}
            </button>
            <span aria-hidden="true" className="text-[11px] text-ink-300">·</span>
            <button type="button" onClick={() => setAll(false)} className="tap px-1 text-[12.5px] font-bold text-ink-500">
              {tr('roll.nobody')}
            </button>
          </span>
        </div>

        <div>
          {people.map((p) => {
            const on = present[p.key]
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={on}
                onClick={() => setPresent((s) => ({ ...s, [p.key]: !s[p.key] }))}
                className={`flex min-h-14 w-full items-center gap-2.5 border-t border-line-divider px-3.5 py-3 text-left ${
                  on ? 'bg-paper' : 'bg-cream-sunk'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-sm border-[1.5px] text-[11px] text-charcoal ${
                    on ? 'border-honey-600 bg-honey-500' : 'border-line-input bg-paper'
                  }`}
                >
                  {on && <Icon name="check" size={11} />}
                </span>
                <span className={`flex-shrink-0 ${on ? '' : 'opacity-45'}`}>
                  <UserAvatar user={p.user} size={30} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`text-sm font-bold ${on ? 'text-ink-900' : 'text-ink-500'}`}>{p.name}</span>
                    {p.guestOf && <Badge tone="neutral">invitado de {p.guestOf}</Badge>}
                  </span>
                  {!on && <span className="mt-0.5 block text-xs text-ink-500">{tr('event.rollcall.absent')}</span>}
                </span>
              </button>
            )
          })}
        </div>

        <div className="border-t border-line-divider p-4">
          <Button block disabled={pending} onClick={save}>
            {pending ? 'Guardando…' : 'Guardar lista'}
          </Button>
          {error && <p className="mt-2.5 rounded-md bg-danger-bg p-3 text-xs text-danger">{error}</p>}
          <div className="mt-2.5 flex items-center justify-between gap-2.5">
            <span className="text-xs leading-relaxed text-ink-300">{tr('event.rollcall.private')}</span>
            <button
              type="button"
              onClick={() => setTaking(false)}
              className="tap flex-shrink-0 px-1 text-[12.5px] font-bold text-ink-500"
            >
              {tr('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- 3. taken ------------------------------------------------------------
  //
  // A record, not a form. Once the roll call exists it stops being the loud
  // thing on the page and becomes one row that says what was written down, who
  // wrote it, and how to fix it. It used to keep a card, a success badge and a
  // sentence explaining what attendance counts are for, all of which are
  // answers to questions nobody asks twice.
  if (takenAt) {
    const everyone = absent.length === 0
    const cameCount = total - absent.length
    const whoCame = people.filter((p) => p.present)
    return (
      <div className="flex items-center gap-3 rounded-md border border-line-card bg-paper px-3.5 py-3">
        <Icon name="clipboard-check" size={16} className="flex-shrink-0 text-ink-300" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink-900">
            {everyone ? tr('roll.allCame') : `${cameCount} de ${total} ${cameCount === 1 ? 'vino' : 'vinieron'}`}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-ink-300">
            La pasó {takenBy ?? tr('event.organization')} · {timeAgo(takenAt, lang)}
            {!everyone && ` · faltaron ${absent.map((p) => p.name).join(', ')}`}
          </span>
        </span>
        <FaceStack people={whoCame.map((p) => p.user)} size={20} max={4} />
        {/* bordered rather than a bare text link: a phone has no hover, so a
            correction affordance has to look like one without being pressed */}
        <button
          type="button"
          onClick={open}
          className="tap flex-shrink-0 rounded-pill border-[1.5px] border-line-card bg-paper px-3 py-1.5 text-[12.5px] font-bold text-ink-900"
        >
          {tr('roll.fix')}
        </button>
      </div>
    )
  }

  // --- 1. not taken yet ----------------------------------------------------
  return (
    <div className="rounded-md border border-honey-200 bg-honey-50 p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-[38px] w-[34px] flex-shrink-0 place-items-center bg-honey-500 text-[15px] text-charcoal"
          style={{ clipPath: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)' }}
        >
          <Icon name="clipboard-check" size={15} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-bold leading-tight text-ink-900">{tr('event.rollcall.who')}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
            {total === 1 ? tr('event.rollcall.cameOne') : tf('event.rollcall.cameMany', { n: total })}.{' '}
            {tr('event.rollcall.tapAbsent')}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <Button block onClick={open}>
          {tr('roll.take')}
        </Button>
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-ink-300">
        {tr('roll.quick')}
      </p>
    </div>
  )
}
