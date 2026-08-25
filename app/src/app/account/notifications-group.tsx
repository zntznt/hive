'use client'

import { useState } from 'react'
import { PushRow } from './push-row'
import NotifPrefsForm from './notif-prefs-form'
import { useT } from '@/components/ui/LangProvider'

// "Cómo te avisa Hive": the channels and the per-topic grid, together.
//
// They were in different groups, so the two halves of one subject sat apart
// and the grid's footnote had to say "agrega tu número arriba, en Cómo
// entras", which is a page apologising for its own structure. WhatsApp appears
// twice in this app, once as an identity you sign in with and once as a place
// messages arrive; this is the second one, and push, which you cannot possibly
// sign in with, was filed under the first.
//
// This owns the push state because two children need it and only one can
// discover it: the row asks the browser, the grid draws a dead column from the
// answer. Asking twice would let them disagree about the same device.
export function NotificationsGroup({
  vapidPublicKey,
  devices,
  notifEmail,
  notifWhatsapp,
  prefs,
  hasWhatsapp,
}: {
  vapidPublicKey: string
  devices: { endpoint: string; label: string | null }[]
  notifEmail: boolean
  notifWhatsapp: boolean
  prefs: Partial<Record<string, { email?: boolean; whatsapp?: boolean; push?: boolean }>>
  hasWhatsapp: boolean
}) {
  const tr = useT()
  // 'checking' until the browser answers, which is why the column starts dead
  // with no reason printed: a column that flashes live and then dies reads as
  // a bug, and a reason shown before we have one would be a guess.
  const [push, setPush] = useState<{
    live: boolean
    state?: string
    deviceName: string
    reason: string | null
    devices?: { endpoint: string; label: string | null }[]
  }>({
    live: false,
    deviceName: tr('account.device.this'),
    reason: null,
  })

  return (
    <section className="mt-2.5">
      <div className="overflow-hidden rounded-md border border-line-card bg-paper">
        <PushRow vapidPublicKey={vapidPublicKey} devices={devices} onState={setPush} />
      </div>
      <div className="mt-[18px]">
        <NotifPrefsForm
          notifEmail={notifEmail}
          notifWhatsapp={notifWhatsapp}
          prefs={prefs}
          hasWhatsapp={hasWhatsapp}
          push={push}
        />
      </div>
    </section>
  )
}
