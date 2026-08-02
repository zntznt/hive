'use client'

import { useState } from 'react'
import { savePaymentMethods } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
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
    const next = rows.filter((r) => r.key !== key)
    setRows(next)
    // Removing is the one edit with nothing left to blur out of, so it commits
    // straight away or the row comes back on reload.
    commit(next)
  }

  // No Save button on this screen, so this runs when a row is finished with:
  // leaving a field, changing a kind, adding or removing a row. Not on every
  // keystroke, because a half typed CLABE is not a payment method and the
  // action would rightly refuse it.
  async function commit(next: Row[] = rows) {
    setSaving(true)
    setError(null)
    const fd = new FormData()
    for (const r of next) {
      if (!r.value.trim()) continue
      fd.append('method_kind', r.kind)
      fd.append('method_value', r.value.trim())
    }
    try {
      const res = await savePaymentMethods(fd)
      // the action returns a refusal rather than throwing, so a failed save
      // must not toast success at someone whose methods did not change
      if (res && !res.ok) setError(res.error)
      else toast('Listo')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-2.5">
      <form className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start gap-2">
            <div className="w-[152px] shrink-0">
              <Select
                name="method_kind"
                value={row.kind}
                onChange={(e) => {
                  const next = rows.map((r) => (r.key === row.key ? { ...r, kind: e.target.value } : r))
                  setRows(next)
                  commit(next)
                }}
                options={PAYMENT_METHOD_OPTIONS}
              />
            </div>
            <div className="min-w-0 flex-1">
              <Input
                name="method_value"
                value={row.value}
                onChange={(e) => updateRow(row.key, { value: e.target.value })}
                onBlur={() => commit()}
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
        {saving && <p className="text-xs text-ink-300">Guardando…</p>}
      </form>
      <p className="mt-2.5 text-xs text-ink-300">
        Esto es lo que ve quien te queda a deber, para saber cómo pagarte. Solo lo ven las
        personas que comparten un club contigo.
      </p>
    </section>
  )
}
