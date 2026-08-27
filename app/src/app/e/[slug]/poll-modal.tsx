'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { useT, useTf } from '@/components/ui/LangProvider'
import { Button } from '@/components/ui/Button'
import { Input, Checkbox } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { createPoll } from '@/app/actions'
import { Icon } from '@/components/ui/Icon'
import type { StringKey } from '@/lib/lang'

// `label` for the same reason as AddExpenseButton: bare under the Encuestas
// header, named on the folded row where the two sit side by side.
export function AddPollButton({ eventId, slug, label }: { eventId: string; slug: string; label?: StringKey }) {
  const tr = useT()
  const tf = useTf()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [multi, setMulti] = useState(false)
  const [anonymous, setAnonymous] = useState(false)
  const [afterClose, setAfterClose] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  function submit() {
    const fd = new FormData()
    fd.set('question', question)
    for (const o of options) fd.append('option', o)
    if (multi) fd.set('kind', 'multi')
    if (anonymous) fd.set('anonymous', 'on')
    if (afterClose) fd.set('show_results', 'after_close')
    startTransition(async () => {
      await createPoll(eventId, slug, fd)
      setOpen(false)
      toast(tr('poll.alive'))
      setQuestion('')
      setOptions(['', '', '', ''])
      router.refresh()
    })
  }

  const validOptions = options.filter((o) => o.trim()).length

  return (
    <>
      <button onClick={() => setOpen(true)} className="tap text-[12.5px] font-bold text-honey-700">
        <Icon name="plus" size={10} /> {tr(label ?? 'common.add')}
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={tr('poll.new')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {tr('common.cancel')}
              </Button>
              <Button disabled={pending || !question.trim() || validOptions < 2} onClick={submit}>
                {tr('poll.create')}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3.5">
            <Input label={tr('poll.question')} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={tr('poll.ph')} autoFocus />
            <div className="flex flex-col gap-2">
              {options.map((o, i) => (
                <Input
                  key={i}
                  value={o}
                  onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`${tf('poll.optionN', { n: i + 1 })}${i >= 2 ? tr('poll.optional') : ''}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Checkbox label={tr('poll.multi')} checked={multi} onChange={(e) => setMulti(e.target.checked)} />
              <Checkbox label={tr('poll.anon')} checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              <Checkbox label={tr('poll.resultsAtClose')} checked={afterClose} onChange={(e) => setAfterClose(e.target.checked)} />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
