import { applyPollOption, castVote, createPoll } from '@/app/actions'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PollOption } from '@/components/ui/PollOption'

type Option = { id: string; label: string; sort: number }
type Vote = { option_id: string; user_id: string }
type Poll = {
  id: string
  question: string
  kind: 'single' | 'multi'
  anonymous: boolean
  closes_at: string | null
  show_results: 'always' | 'after_close'
  applied_option_id: string | null
  created_by: string
  poll_options: Option[]
  votes: Vote[]
}

type Props = {
  eventId: string
  slug: string
  myId: string
  isOrganizer: boolean
  nameOf: Map<string, string>
  polls: Poll[]
}

export default function Polls({ eventId, slug, myId, isOrganizer, nameOf, polls }: Props) {
  return (
    <section className="mb-8">
      <SectionHeader>Encuestas</SectionHeader>

      {polls.length === 0 && <p className="mb-3 text-sm text-ink-500">Nadie ha preguntado nada todavía.</p>}

      <ul className="mb-4 flex flex-col gap-3">
        {polls.map((p) => {
          const opts = [...p.poll_options].sort((a, b) => a.sort - b.sort)
          const closed = !!p.closes_at && new Date(p.closes_at) <= new Date()
          const showResults = p.show_results === 'always' || closed
          const myOptionIds = new Set(p.votes.filter((v) => v.user_id === myId).map((v) => v.option_id))
          // votes.user_id is only populated for me on anonymous polls (RLS hides others),
          // so total counts come from row count, names only from non-anonymous polls.
          const countFor = (optId: string) => p.votes.filter((v) => v.option_id === optId).length
          const maxCount = Math.max(1, ...opts.map((o) => countFor(o.id)))

          return (
            <li key={p.id}>
              <Card pad="sm">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="font-bold text-ink-900">{p.question}</span>
                  <span className="flex-shrink-0 text-xs text-ink-300">
                    {nameOf.get(p.created_by) ?? '·'}
                    {p.anonymous ? ' · anónima' : ''}
                    {closed ? ' · cerrada' : ''}
                  </span>
                </div>

                <ul className="flex flex-col gap-1.5">
                  {opts.map((o) => {
                    const n = countFor(o.id)
                    const mine = myOptionIds.has(o.id)
                    const applied = p.applied_option_id === o.id
                    return (
                      <li key={o.id}>
                        <div className="flex items-center gap-2">
                          <form action={castVote.bind(null, p.id, o.id, slug, p.kind)} className="flex-1">
                            <button type="submit" disabled={closed} className="w-full disabled:opacity-60">
                              <PollOption label={o.label} votes={n} max={maxCount} selected={mine} chosen={applied} showResults={showResults} multi={p.kind === 'multi'} />
                            </button>
                          </form>
                          {isOrganizer && !applied && (
                            <form action={applyPollOption.bind(null, p.id, o.id, slug)}>
                              <button className="flex-shrink-0 text-xs font-bold text-honey-700">elegir</button>
                            </form>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>

                {!showResults && <p className="mt-2 text-xs text-ink-300">Los resultados se ven cuando cierre la encuesta.</p>}
                {p.applied_option_id && <p className="mt-2 text-xs text-ink-500">El voto sigue a la vista aunque se haya elegido una opción.</p>}
              </Card>
            </li>
          )
        })}
      </ul>

      <details className="rounded-lg border-[1.5px] border-dashed border-line-input p-3">
        <summary className="cursor-pointer text-sm font-bold text-honey-700">Nueva encuesta</summary>
        <form action={createPoll.bind(null, eventId, slug)} className="mt-3 flex flex-col gap-2">
          <input name="question" required placeholder="¿A qué jugamos?" className="w-full rounded-md border border-line-input bg-paper p-2 text-sm text-ink-900" />
          <input name="option" placeholder="Opción 1" className="w-full rounded-md border border-line-input bg-paper p-2 text-sm text-ink-900" />
          <input name="option" placeholder="Opción 2" className="w-full rounded-md border border-line-input bg-paper p-2 text-sm text-ink-900" />
          <input name="option" placeholder="Opción 3 (opcional)" className="w-full rounded-md border border-line-input bg-paper p-2 text-sm text-ink-900" />
          <input name="option" placeholder="Opción 4 (opcional)" className="w-full rounded-md border border-line-input bg-paper p-2 text-sm text-ink-900" />
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-sm text-ink-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="kind" value="multi" className="accent-honey-500" /> varias opciones
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="anonymous" className="accent-honey-500" /> anónima
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="show_results" value="after_close" className="accent-honey-500" /> resultados al cerrar
            </label>
          </div>
          <Button size="sm">Crear encuesta</Button>
        </form>
      </details>
    </section>
  )
}
