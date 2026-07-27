'use client'

import { useState } from 'react'
import { updateWhatsappPhone } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatPhone } from '@/lib/phone'

// The WhatsApp delivery address. Collapsed to a summary row until you tap
// "agregar"/"cambiar", so the section keeps the same calm two-row shape as
// before for the common case where nothing needs touching.
export default function WhatsappForm({ phone }: { phone: string | null }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(phone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(next: string) {
    setSaving(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('phone', next)
      await updateWhatsappPhone(fd)
      toast(next ? 'WhatsApp actualizado' : 'WhatsApp quitado')
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-md border border-line-card bg-paper px-3.5 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-ink-900">
          WhatsApp <span className="text-ink-500">· {phone ? formatPhone(phone) : 'no agregado'}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {phone && <Badge tone="active">activo</Badge>}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-md border-[1.5px] border-honey-500 px-2.5 py-1 text-xs font-bold text-honey-700"
          >
            {open ? 'cancelar' : phone ? 'cambiar' : 'agregar'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2.5 flex flex-col gap-2 border-t border-line-card pt-2.5">
          <Input
            label="Número de WhatsApp"
            placeholder="+52 55 1234 5678"
            inputMode="tel"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-ink-300">
            Lo usamos para mandarte avisos por WhatsApp.
          </p>
          {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={saving || !value.trim()} onClick={() => save(value.trim())}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
            {phone && (
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setValue('')
                  save('')
                }}
              >
                Quitar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
