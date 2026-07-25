'use client'

import { Fragment, useState } from 'react'
import { updateNotifPrefs } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { NOTIF_TOPICS } from '@/lib/notif-topics'

type Matrix = Partial<Record<string, { email?: boolean; whatsapp?: boolean }>>

// Topic x channel notification matrix. Every row is a notification the
// pipeline really sends. Both columns can be on at once: each ticked channel
// queues its own outbox row. WhatsApp needs a linked number to deliver,
// otherwise the notification falls back to correo.
export default function NotifPrefsForm({
  notifEmail,
  notifWhatsapp,
  prefs,
}: {
  notifEmail: boolean
  notifWhatsapp: boolean
  prefs: Matrix
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(formData: FormData) {
    setSaving(true)
    setError(null)
    try {
      await updateNotifPrefs(formData)
      toast('Preferencias guardadas')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  const check = 'h-[17px] w-[17px] accent-honey-500'

  return (
    <section className="mb-6">
      <SectionHeader>Notificaciones</SectionHeader>
      <form action={submit} className="flex flex-col gap-2.5">
        <div className="grid items-center gap-x-2 gap-y-2.5" style={{ gridTemplateColumns: '1fr 52px 76px' }}>
          <span />
          <span className="text-center text-[11px] font-extrabold uppercase tracking-wide text-ink-500">Correo</span>
          <span className="text-center text-[11px] font-extrabold uppercase tracking-wide text-ink-500">WhatsApp</span>
          {NOTIF_TOPICS.map((t) => {
            const p = prefs[t.key]
            return (
              <Fragment key={t.key}>
                <span className="text-sm text-ink-700">{t.label}</span>
                <span className="text-center">
                  <input type="checkbox" name={`t_${t.key}_email`} defaultChecked={p?.email ?? notifEmail} className={check} />
                </span>
                <span className="text-center">
                  <input type="checkbox" name={`t_${t.key}_whatsapp`} defaultChecked={p?.whatsapp ?? notifWhatsapp} className={check} />
                </span>
              </Fragment>
            )
          })}
        </div>
        <p className="text-xs text-ink-300">
          Hive no tiene bandeja propia. Todo llega a donde ya estás: correo o WhatsApp. Para recibir por WhatsApp agrega tu número arriba, en &quot;Cómo entras&quot;.
        </p>
        {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
        <Button type="submit" size="sm" className="self-start" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </section>
  )
}
