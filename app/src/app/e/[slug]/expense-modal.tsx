'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { useT } from '@/components/ui/LangProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { addExpense, updateExpense, removeExpense } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'
import type { StringKey } from '@/lib/lang'

type Member = { user_id: string; name: string; in: boolean }
type Guest = { id: string; name: string; host_user_id: string; promoted_to_user_id: string | null }

export function AddExpenseButton({
  eventId,
  slug,
  myId,
  members,
  guests,
  nameOf,
  label,
}: {
  eventId: string
  slug: string
  myId: string
  members: Member[]
  guests: Guest[]
  nameOf: Map<string, string>
  // Under the Gastos header the section says what this adds, so the button
  // is bare. On the folded row it sits next to the poll button with nothing
  // naming either, and two identical "Agregar" links is a coin toss.
  label?: StringKey
}) {
  const tr = useT()
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
        toast(tr('money.expense.saved'))
        setNote('')
        setAmount('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : tr('money.expense.failed'))
      }
    })
  }

  const claimableGuests = guests.filter((g) => !g.promoted_to_user_id)

  return (
    <>
      <button onClick={() => setOpen(true)} className="tap text-[12.5px] font-bold text-honey-700">
        <Icon name="plus" size={10} /> {tr(label ?? 'common.add')}
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={tr('money.expense.add')}
          subtitle={tr('money.expense.youPaid')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {tr('common.cancel')}
              </Button>
              <Button disabled={pending || !note.trim() || !amount.trim()} onClick={submit}>
                {tr('money.saveExpense')}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3.5">
            <div className="flex gap-2.5">
              <div className="flex-1">
                <Input label={tr('money.expense.what')} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pizzas" autoFocus />
              </div>
              <div className="w-[110px]">
                <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">{tr('money.amount')}</span>
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
              <p className="mb-1.5 text-[12.5px] font-semibold text-ink-700">{tr('money.expense.split')}</p>
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
                {tr('money.youPaidNote')}
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
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [n, setN] = useState(note)
  const [a, setA] = useState(amount)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const toast = useToast()

  // Deleting a wrong expense had no path at all: the RLS policy existed and
  // nothing called it, so a duplicate stayed on the event forever skewing
  // every balance under it.
  function remove() {
    startTransition(async () => {
      const res = await removeExpense(id, slug)
      if (!res.ok) return setError(res.error)
      setOpen(false)
      toast(tr('expense.deleted'))
      router.refresh()
    })
  }

  function submit() {
    const fd = new FormData()
    fd.set('note', n)
    fd.set('amount', a)
    startTransition(async () => {
      try {
        await updateExpense(id, slug, fd)
        setOpen(false)
        toast(tr('expense.updated'))
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : tr('common.notSaved'))
      }
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={tr('money.expense.edit')} className="tap border-none bg-transparent p-0 text-xs text-ink-300">
        <Icon name="pen" size={12} />
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={tr('money.expense.edit')}
          subtitle={tr('money.expense.settled')}
          footer={
            <>
              <Button variant="danger" disabled={pending} onClick={remove}>
                {tr('thread.delete')}
              </Button>
              <span className="flex-1" />
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {tr('common.cancel')}
              </Button>
              <Button disabled={pending || !n.trim() || !a.trim()} onClick={submit}>
                {tr('common.save')}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3.5">
            <div className="flex gap-2.5">
              <div className="flex-1">
                <Input label={tr('money.expense.what')} value={n} onChange={(e) => setN(e.target.value)} autoFocus />
              </div>
              <div className="w-28">
                <Input label={tr('money.amount')} value={a} onChange={(e) => setA(e.target.value)} inputMode="decimal" />
              </div>
            </div>
            <p className="rounded-md bg-cream-sunk px-3.5 py-3 text-[13px] leading-relaxed text-ink-700">
              {tr('money.upDownNote')}
            </p>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  )
}
