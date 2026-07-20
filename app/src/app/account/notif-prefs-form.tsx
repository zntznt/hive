'use client'

import { useState } from 'react'
import { updateNotifPrefs } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Input'
import { SectionHeader } from '@/components/ui/SectionHeader'

export default function NotifPrefsForm({
  notifEmail,
  notifWhatsapp,
}: {
  notifEmail: boolean
  notifWhatsapp: boolean
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

  return (
    <section className="mb-6">
      <SectionHeader>Notificaciones</SectionHeader>
      <form action={submit} className="flex flex-col gap-2.5">
        <Checkbox name="notif_email" defaultChecked={notifEmail} label="Avisarme por correo" />
        <Checkbox name="notif_whatsapp" defaultChecked={notifWhatsapp} label="Avisarme por WhatsApp" />
        <p className="text-xs text-ink-300">
          Hive no tiene bandeja propia. Todo llega a donde ya estás: correo o WhatsApp.
        </p>
        {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
        <Button type="submit" size="sm" className="self-start" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </section>
  )
}
