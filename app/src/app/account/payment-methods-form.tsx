'use client'

import { useState } from 'react'
import { savePaymentMethods } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/payment-method-labels'
import { Icon } from '@/components/ui/Icon'

export type PaymentMethod = {
  id: string
  kind: 'bank_account' | 'bank_code' | 'card' | 'cash' | 'other'
  value: string
  sort: number
}

type Row = { key: number; kind: string; value: string }

// Repeatable {kind, value} rows, submitted as parallel arrays (method_kind[],
// method_value[]) to savePaymentMethods, which replaces the user's full set.
export default function PaymentMethodsForm({ methods }: { methods: PaymentMethod[] }) {
  const toast = useToast()
  const [rows, setRows] = useState<Row[]>(() =>
    methods.length ? methods.map((m, i) => ({ key: i, kind: m.kind, value: m.value })) : [{ key: 0, kind: 'bank_account', value: '' }]
  )
  const [nextKey, setNextKey] = useState(() => Math.max(1, methods.length))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((rs) => [...rs, { key: nextKey, kind: 'bank_account', value: '' }])
    setNextKey((k) => k + 1)
  }
  function removeRow(key: number) {
    setRows((rs) => rs.filter((r) => r.key !== key))
  }

  async function submit(formData: FormData) {
    setSaving(true)
    setError(null)
    try {
      await savePaymentMethods(formData)
      toast('Formas de pago guardadas')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-[26px]">
      <SectionHeader>Cómo te pagan</SectionHeader>
      <form action={submit} className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start gap-2">
            <div className="w-[152px] shrink-0">
              <Select
                name="method_kind"
                value={row.kind}
                onChange={(e) => updateRow(row.key, { kind: e.target.value })}
                options={PAYMENT_METHOD_OPTIONS}
              />
            </div>
            <div className="min-w-0 flex-1">
              <Input
                name="method_value"
                value={row.value}
                onChange={(e) => updateRow(row.key, { value: e.target.value })}
                placeholder="Número, alias, nota…"
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              aria-label="Quitar forma de pago"
              className="tap mt-2.5 shrink-0 text-[12.5px] font-bold text-ink-500"
            >
              Quitar
            </button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={addRow}>
          <Icon name="plus" size={10} /> Agregar forma de pago
        </Button>
        {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar formas de pago'}
        </Button>
      </form>
      <p className="mt-2.5 text-xs text-ink-300">
        Esto es lo que ve quien te queda a deber, para saber cómo pagarte. Solo lo ven las
        personas que comparten un club contigo.
      </p>
    </section>
  )
}
