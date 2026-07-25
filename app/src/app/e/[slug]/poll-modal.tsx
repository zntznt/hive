'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Checkbox } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { createPoll } from '@/app/actions'

export function AddPollButton({ eventId, slug }: { eventId: string; slug: string }) {
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
      toast('La encuesta está viva.')
      setQuestion('')
      setOptions(['', '', '', ''])
      router.refresh()
    })
  }

  const validOptions = options.filter((o) => o.trim()).length

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[12.5px] font-bold text-honey-700">
        ＋ Añadir
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Nueva encuesta"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={pending || !question.trim() || validOptions < 2} onClick={submit}>
                Crear encuesta
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3.5">
            <Input label="Pregunta" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="¿A qué jugamos?" autoFocus />
            <div className="flex flex-col gap-2">
              {options.map((o, i) => (
                <Input
                  key={i}
                  value={o}
                  onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Opción ${i + 1}${i >= 2 ? ' (opcional)' : ''}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Checkbox label="varias opciones" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
              <Checkbox label="anónima" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              <Checkbox label="resultados al cerrar" checked={afterClose} onChange={(e) => setAfterClose(e.target.checked)} />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
