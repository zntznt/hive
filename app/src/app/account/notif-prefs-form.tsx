'use client'

import { Fragment, useRef, useState } from 'react'
import { updateNotifPrefs } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Icon, type IconName } from '@/components/ui/Icon'
import { NOTIF_TOPICS } from '@/lib/notif-topics'
import { useT } from '@/components/ui/LangProvider'

type Matrix = Partial<Record<string, { email?: boolean; whatsapp?: boolean; push?: boolean }>>
type ChannelId = 'email' | 'whatsapp' | 'push'

// Topic x channel. Every row is a notification the pipeline really sends, and
// every ticked cell queues its own outbox row, so two channels on one topic is
// two messages by design.
//
// Three channels at 375px, so the column headers are icons. Words do not fit,
// least of all in Spanish, and spending the width on words is exactly what
// left no room for the third channel: two word headers ate 128px of a 460px
// column, and push ended up homeless in a different group entirely.
//
// Email and WhatsApp are per-person; push is per-device. That asymmetry has to
// be readable rather than hidden, which is what the legend under the grid is
// for: ticking push here speaks for this phone and no other.
//
// A channel that cannot deliver is a dead column, not a live column with a
// footnote. With no number saved you could tick WhatsApp on five topics and
// nothing would ever arrive, and the only clue was a sentence underneath. Now
// the header goes dashed, the cells sink, the switches disable, and the reason
// plus the way to fix it sits under the table.
//
// No Save button: each switch commits as it is flipped.

export default function NotifPrefsForm({
  notifEmail,
  notifWhatsapp,
  prefs,
  hasWhatsapp,
  push,
}: {
  notifEmail: boolean
  notifWhatsapp: boolean
  prefs: Matrix
  hasWhatsapp: boolean
  // The push channel's own state, owned by the row above this one, because
  // whether this device can ring is a fact about the browser and not a
  // preference. `deviceName` names it, since a switch here is about one phone.
  push: {
    live: boolean
    state?: string
    deviceName: string
    reason: string | null
    devices?: { endpoint: string; label: string | null }[]
  }
}) {
  const toast = useToast()
  const tr = useT()
  const formRef = useRef<HTMLFormElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mirrored so a switch flips under the thumb; the write follows.
  const [rows, setRows] = useState<Matrix>(() =>
    Object.fromEntries(
      NOTIF_TOPICS.map((t) => [
        t.key,
        {
          email: prefs[t.key]?.email ?? notifEmail,
          whatsapp: prefs[t.key]?.whatsapp ?? notifWhatsapp,
          push: prefs[t.key]?.push ?? true,
        },
      ])
    )
  )

  const CH: { id: ChannelId; icon: IconName; label: string; scope: string; live: boolean }[] = [
    { id: 'email', icon: 'envelope', label: tr('notif.email'), scope: tr('notif.scope.you'), live: true },
    { id: 'whatsapp', icon: 'whatsapp', label: tr('notif.whatsapp'), scope: tr('notif.scope.you'), live: hasWhatsapp },
    { id: 'push', icon: 'bell', label: tr('notif.push'), scope: push.deviceName, live: push.live },
  ]

  async function commit(next: Matrix) {
    setSaving(true)
    setError(null)
    const fd = new FormData()
    for (const t of NOTIF_TOPICS) {
      const r = next[t.key]
      if (r?.email) fd.set(`t_${t.key}_email`, 'on')
      if (r?.whatsapp) fd.set(`t_${t.key}_whatsapp`, 'on')
      if (r?.push) fd.set(`t_${t.key}_push`, 'on')
    }
    try {
      await updateNotifPrefs(fd)
      toast(tr('common.saved'))
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('common.notSaved'))
    } finally {
      setSaving(false)
    }
  }

  function flip(topic: string, ch: ChannelId) {
    if (!CH.find((c) => c.id === ch)!.live) return
    const next = { ...rows, [topic]: { ...rows[topic], [ch]: !rows[topic]?.[ch] } }
    setRows(next)
    commit(next)
  }

  return (
    <form ref={formRef} className="flex flex-col">
      <div
        className="grid items-center"
        style={{ gridTemplateColumns: 'minmax(0,1fr) 44px 44px 44px', columnGap: 4 }}
      >
        <span />
        {CH.map((c) => (
          <span key={c.id} title={c.label} aria-label={c.label} className="flex flex-col items-center pb-2">
            <span
              className={`grid h-[34px] w-[34px] place-items-center rounded-sm ${
                c.live
                  ? 'border border-line-card bg-cream-sunk text-ink-700'
                  : 'border border-dashed border-line-input text-ink-300'
              }`}
            >
              <Icon name={c.icon} size={14} />
            </span>
          </span>
        ))}

        {NOTIF_TOPICS.map((t, i) => (
          <Fragment key={t.key}>
            <span
              className={`pr-1.5 text-[13.5px] leading-snug text-ink-700 ${i ? 'border-t border-line-divider pt-1.5' : ''} pb-1.5`}
            >
              {tr(t.labelKey)}
            </span>
            {CH.map((c) => {
              const on = !!rows[t.key]?.[c.id] && c.live
              return (
                <span
                  key={c.id}
                  className={`grid h-11 place-items-center ${i ? 'border-t border-line-divider' : ''} ${
                    c.live ? '' : 'bg-cream-sunk'
                  }`}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${tr(t.labelKey)} · ${c.label}`}
                    disabled={!c.live}
                    onClick={() => flip(t.key, c.id)}
                    className="grid h-11 w-11 place-items-center disabled:cursor-not-allowed"
                  >
                    <span
                      className={`grid h-[22px] w-[22px] place-items-center rounded-[7px] border-[1.5px] ${
                        on
                          ? 'border-honey-600 bg-honey-500 text-charcoal'
                          : c.live
                            ? 'border-line-input bg-paper'
                            : 'border-line-divider bg-paper opacity-50'
                      }`}
                    >
                      {on && <Icon name="check" size={11} />}
                    </span>
                  </button>
                </span>
              )
            })}
          </Fragment>
        ))}
      </div>

      {/* The asymmetry, stated. Two of these reach a person and one reaches a
          handset, and nothing else on the page says so. */}
      <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
        {CH.map((c) => (
          <span
            key={c.id}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs ${
              c.live ? 'text-ink-700' : 'text-ink-500'
            }`}
          >
            <Icon name={c.icon} size={11} />
            {c.label} <span className="text-ink-500">· {c.scope}</span>
          </span>
        ))}
      </div>

      {!hasWhatsapp && (
        <p className="mt-2 text-xs leading-relaxed text-ink-300">
          {tr('notif.needWhatsapp')}
        </p>
      )}

      {!push.live && push.reason && (
        <div className="mt-2.5 flex items-start gap-2 rounded-md border border-line-card bg-cream-sunk px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-700">
          <span className="mt-0.5 flex-shrink-0">
            <Icon name="bell-slash" size={13} className="text-ink-500" />
          </span>
          <span className="min-w-0 flex-1">
            {push.reason} {tr('notif.kept')}
            {/* The file's own comment promised the fix sits under the table,
                and there was nothing to press. This sends you to the control
                that owns it rather than asking for the permission a second
                time here: two places asking the browser is exactly the drift
                this codebase keeps paying for. */}
            {push.state !== 'unsupported' && (
              <button
                type="button"
                onClick={() => document.getElementById('push-row')?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                className="tap mt-1.5 inline-flex min-h-11 items-center rounded-pill border-[1.5px] border-line-input bg-paper px-3.5 text-[12.5px] font-bold text-honey-800"
              >
                {tr('notif.fixPush')}
              </button>
            )}
          </span>
        </div>
      )}

      {/* Push is per device and nothing said so. The other-devices line named
          them without ever saying which ones actually have it on. */}
      {(push.devices?.length ?? 0) > 0 && (
        <div className="mt-2.5 rounded-md border border-line-card bg-paper px-3 py-2.5">
          <p className="eyebrow mb-1.5">{tr('notif.devices')}</p>
          <ul className="flex flex-col gap-1">
            {/* This browser first, and from what the browser says right now
                rather than from whether a subscription row for it survives in
                the table. Those were two answers to one question and they
                contradicted each other on screen: the banner above said push
                here was blocked while this list said the same machine was
                activado, and then said it was apagados four rows later.
                `push.devices` is everyone else now, decided by the row that
                knows which endpoint is this browser. */}
            <li className="flex items-center gap-2 text-[12.5px] text-ink-700">
              <span
                className={`h-[7px] w-[7px] flex-shrink-0 rounded-full ${push.live ? 'bg-success' : 'bg-ink-300'}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{push.deviceName}</span>
              <span className="flex-shrink-0 text-[11.5px] text-ink-300">
                {tr(push.live ? 'push.on' : 'push.badge.off')}
              </span>
            </li>
            {push.devices!.map((d) => (
              <li key={d.endpoint} className="flex items-center gap-2 text-[12.5px] text-ink-700">
                <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full bg-success" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{d.label ?? tr('notif.thisDevice')}</span>
                <span className="flex-shrink-0 text-[11.5px] text-ink-300">{tr('push.on')}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-300">{tr('notif.everywhere')}</p>
        </div>
      )}

      {error && <p className="mt-2.5 rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {saving && <p className="mt-2 text-xs text-ink-300">{tr('common.saving')}</p>}
    </form>
  )
}
