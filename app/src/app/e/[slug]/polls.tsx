import { applyPollOption, castVote, createPoll } from '@/app/actions'

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
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">Encuestas</h2>

      {polls.length === 0 && (
        <p className="mb-3 text-sm text-stone-500">Nadie ha preguntado nada todavía.</p>
      )}

      <ul className="mb-4 space-y-3">
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
            <li key={p.id} className="rounded-xl border border-stone-200 bg-white p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="font-medium text-stone-800">{p.question}</span>
                <span className="shrink-0 text-xs text-stone-400">
                  {nameOf.get(p.created_by) ?? '·'}
                  {p.anonymous ? ' · anónima' : ''}
                  {closed ? ' · cerrada' : ''}
                </span>
              </div>

              <ul className="space-y-1">
                {opts.map((o) => {
                  const n = countFor(o.id)
                  const mine = myOptionIds.has(o.id)
                  const applied = p.applied_option_id === o.id
                  return (
                    <li key={o.id}>
                      <form
                        action={castVote.bind(null, p.id, o.id, slug, p.kind)}
                        className="flex items-center gap-2"
                      >
                        <button
                          disabled={closed}
                          className={`flex flex-1 items-center justify-between rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-60 ${
                            mine
                              ? 'border-amber-500 bg-amber-50 text-amber-900'
                              : 'border-stone-200 text-stone-700'
                          }`}
                        >
                          <span>
                            {p.kind === 'multi' ? (mine ? '☑ ' : '☐ ') : mine ? '● ' : '○ '}
                            {o.label}
                            {applied && (
                              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                                elegida
                              </span>
                            )}
                          </span>
                          {showResults && <span className="ml-2 text-stone-400">{n}</span>}
                        </button>
                        {isOrganizer && !applied && (
                          <button
                            formAction={applyPollOption.bind(null, p.id, o.id, slug)}
                            className="shrink-0 text-xs text-amber-700 underline"
                          >
                            elegir
                          </button>
                        )}
                      </form>
                      {showResults && (
                        <div className="ml-1 mt-0.5 h-1 rounded bg-stone-100">
                          <div
                            className="h-1 rounded bg-amber-400"
                            style={{ width: `${(n / maxCount) * 100}%` }}
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>

              {!showResults && (
                <p className="mt-2 text-xs text-stone-400">
                  Los resultados se ven cuando cierre la encuesta.
                </p>
              )}
              {p.applied_option_id && (
                <p className="mt-2 text-xs text-stone-500">
                  El voto sigue a la vista aunque se haya elegido una opción.
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <details className="rounded-xl border border-dashed border-stone-300 p-3">
        <summary className="cursor-pointer text-sm font-medium text-amber-700">
          Nueva encuesta
        </summary>
        <form action={createPoll.bind(null, eventId, slug)} className="mt-3 space-y-2">
          <input
            name="question"
            required
            placeholder="¿A qué jugamos?"
            className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm outline-amber-500"
          />
          <input
            name="option"
            placeholder="Opción 1"
            className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm outline-amber-500"
          />
          <input
            name="option"
            placeholder="Opción 2"
            className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm outline-amber-500"
          />
          <input
            name="option"
            placeholder="Opción 3 (opcional)"
            className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm outline-amber-500"
          />
          <input
            name="option"
            placeholder="Opción 4 (opcional)"
            className="w-full rounded-lg border border-stone-300 bg-white p-2 text-sm outline-amber-500"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="kind" value="multi" /> varias opciones
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="anonymous" /> anónima
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="show_results" value="after_close" /> resultados al cerrar
            </label>
          </div>
          <button className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white">
            Crear encuesta
          </button>
        </form>
      </details>
    </section>
  )
}
