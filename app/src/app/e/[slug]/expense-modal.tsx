'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { addExpense, updateExpense } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'

type Member = { user_id: string; name: string; in: boolean }
type Guest = { id: string; name: string; host_user_id: string; promoted_to_user_id: string | null }

export function AddExpenseButton({
  eventId,
  slug,
  myId,
  members,
  guests,
  nameOf,
}: {
  eventId: string
  slug: string
  myId: string
  members: Member[]
  guests: Guest[]
  nameOf: Map<string, string>
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [participants, setParticipants] = useState<Set<string>>(
    new Set(members.filter((m) => m.in || m.user_id === myId).map((m) => `u:${m.user_id}`))
  )
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const toast = useToast()

  function toggle(key: string) {
    setParticipants((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function submit() {
    const fd = new FormData()
    fd.set('note', note)
    fd.set('amount', amount)
    for (const p of participants) fd.append('participant', p)
    startTransition(async () => {
      try {
        await addExpense(eventId, slug, fd)
        setOpen(false)
        toast('Gasto guardado. Se actualizó el reparto.')
        setNote('')
        setAmount('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo guardar el gasto.')
      }
    })
  }

  const claimableGuests = guests.filter((g) => !g.promoted_to_user_id)

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[12.5px] font-bold text-honey-700">
        ＋ Añadir
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Añadir un gasto"
          subtitle="Lo pagaste tú"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={pending || !note.trim() || !amount.trim()} onClick={submit}>
                Guardar gasto
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3.5">
            <div className="flex gap-2.5">
              <div className="flex-1">
                <Input label="Qué fue" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pizzas" autoFocus />
              </div>
              <div className="w-[110px]">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">Cantidad</span>
                <div className="flex items-center gap-1 rounded-md border-[1.5px] border-line-input bg-paper px-3">
                  <span className="text-ink-500">$</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="42.50"
                    inputMode="decimal"
                    className="w-full border-none bg-transparent py-[11px] text-sm text-ink-900 outline-none"
                  />
                </div>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[12.5px] font-semibold text-ink-700">Entre quiénes se reparte</p>
              <div className="grid grid-cols-2 gap-1.5 text-sm text-ink-700">
                {members.map((m) => (
                  <label key={m.user_id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={participants.has(`u:${m.user_id}`)}
                      onChange={() => toggle(`u:${m.user_id}`)}
                      className="accent-honey-500"
                    />
                    {nameOf.get(m.user_id) ?? m.name}
                  </label>
                ))}
                {claimableGuests.map((g) => (
                  <label key={g.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={participants.has(`g:${g.id}`)} onChange={() => toggle(`g:${g.id}`)} className="accent-honey-500" />
                    {g.name} <span className="text-xs text-ink-300">(de {nameOf.get(g.host_user_id) ?? '·'})</span>
                  </label>
                ))}
              </div>
              <p className="mt-2.5 text-xs text-ink-300">
                Lo pagaste tú, así que te deben el total; se reparte en partes iguales entre quienes marques.
              </p>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  )
}

export function EditExpenseButton({ id, slug, note, amount }: { id: string; slug: string; note: string; amount: string }) {
  const [open, setOpen] = useState(false)
  const [n, setN] = useState(note)
  const [a, setA] = useState(amount)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const toast = useToast()

  function submit() {
    const fd = new FormData()
    fd.set('note', n)
    fd.set('amount', a)
    startTransition(async () => {
      try {
        await updateExpense(id, slug, fd)
        setOpen(false)
        toast('Gasto actualizado.')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      }
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Editar gasto" className="border-none bg-transparent p-0 text-xs text-ink-300">
        <Icon name="pen" size={12} />
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Editar gasto"
          subtitle="Los pagos ya confirmados se quedan como están"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={pending || !n.trim() || !a.trim()} onClick={submit}>
                Guardar
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3.5">
            <div className="flex gap-2.5">
              <div className="flex-1">
                <Input label="Qué fue" value={n} onChange={(e) => setN(e.target.value)} autoFocus />
              </div>
              <div className="w-28">
                <Input label="Cantidad" value={a} onChange={(e) => setA(e.target.value)} inputMode="decimal" />
              </div>
            </div>
            <p className="rounded-md bg-cream-sunk px-3.5 py-3 text-[13px] leading-relaxed text-ink-700">
              Si la cantidad sube, se abre una deuda nueva por la diferencia. Si baja, se debe la diferencia de vuelta a quien ya pagó.
            </p>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  )
}
