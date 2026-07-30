'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HexAvatar } from '@/components/ui/HexAvatar'
import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Icon } from '@/components/ui/Icon'

export type SearchClub = { slug: string; name: string; members: number; upcoming: number }
export type SearchEvent = { slug: string; title: string; club: string; when: string; place: string | null }
export type SearchPerson = { id: string; name: string; shared: number; user: AvatarUser }

// One field across events, clubs and people. Filtering happens here rather
// than on the server: the set is everything RLS already lets this member see,
// which at club scale is small, and a keystroke should not cost a round trip.
// If a club ever gets big enough for that to hurt, this becomes a query.
export default function SearchClient({
  clubs,
  events,
  people,
}: {
  clubs: SearchClub[]
  events: SearchEvent[]
  people: SearchPerson[]
}) {
  const [q, setQ] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const term = q.trim().toLowerCase()

  const hit = (s: string | null | undefined) => String(s ?? '').toLowerCase().includes(term)
  const found = useMemo(() => {
    if (!term) return { clubs: [], events: [], people: [] }
    return {
      clubs: clubs.filter((c) => hit(c.name)),
      events: events.filter((e) => hit(e.title) || hit(e.place) || hit(e.club)).slice(0, 8),
      people: people.filter((p) => hit(p.name)).slice(0, 8),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, clubs, events, people])

  const nothing = term && !found.clubs.length && !found.events.length && !found.people.length

  const Row = ({
    href,
    avatar,
    icon,
    title,
    sub,
  }: {
    href: string
    avatar?: React.ReactNode
    icon?: 'calendar-day'
    title: string
    sub: string
  }) => (
    <Link
      href={href}
      className="flex min-h-14 w-full items-center gap-[11px] rounded-md border border-line-card bg-paper px-3.5 py-3 text-left"
    >
      {avatar ?? (
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-sm bg-cream-sunk text-ink-500">
          <Icon name={icon ?? 'calendar-day'} size={13} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink-900">{title}</span>
        <span className="text-[12.5px] text-ink-500">{sub}</span>
      </span>
      <Icon name="chevron-right" size={11} className="text-ink-300" />
    </Link>
  )

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <div className="mb-[18px] mt-1 flex items-center gap-2.5">
        <div className="flex min-h-11 flex-1 items-center gap-2.5 rounded-pill border-[1.5px] border-line-input bg-paper px-4">
          <Icon name="magnifying-glass" size={13} className="text-ink-500" />
          <input
            ref={ref}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca eventos, clubs, personas"
            className="flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('')
                ref.current?.focus()
              }}
              aria-label="Limpiar"
              className="-mr-3 grid h-11 w-11 place-items-center text-ink-500"
            >
              <Icon name="circle-xmark" size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-11 items-center px-1 text-[13.5px] font-bold text-ink-700"
        >
          Cancelar
        </button>
      </div>

      {!term && (
        <>
          <SectionHeader>Ir a</SectionHeader>
          <div className="mb-[26px] flex flex-wrap gap-2">
            {[
              ['Dinero pendiente', '/events?owed=true'],
              ['Tu historial', `/events?person=me`],
              ['Esta semana', '/events?when=upcoming'],
              ['Eventos pasados', '/events?when=past'],
            ].map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className="inline-flex min-h-11 items-center rounded-pill border-[1.5px] border-line-card bg-paper px-4 text-[12.5px] font-bold text-ink-900"
              >
                {label}
              </Link>
            ))}
          </div>
        </>
      )}

      {found.clubs.length > 0 && (
        <>
          <SectionHeader>Clubs · {found.clubs.length}</SectionHeader>
          <div className="mb-[26px] flex flex-col gap-2">
            {found.clubs.map((c) => (
              <Row
                key={c.slug}
                href={`/club/${c.slug}`}
                avatar={<HexAvatar name={c.name} size={32} />}
                title={c.name}
                sub={`${c.members} ${c.members === 1 ? 'miembro' : 'miembros'} · ${c.upcoming} ${
                  c.upcoming === 1 ? 'próximo' : 'próximos'
                }`}
              />
            ))}
          </div>
        </>
      )}

      {found.events.length > 0 && (
        <>
          <SectionHeader>Eventos · {found.events.length}</SectionHeader>
          <div className="mb-[26px] flex flex-col gap-2">
            {found.events.map((e) => (
              <Row
                key={e.slug}
                href={`/e/${e.slug}`}
                icon="calendar-day"
                title={e.title}
                sub={[e.club, e.when, e.place].filter(Boolean).join(' · ')}
              />
            ))}
          </div>
        </>
      )}

      {found.people.length > 0 && (
        <>
          <SectionHeader>Personas · {found.people.length}</SectionHeader>
          <div className="mb-[26px] flex flex-col gap-2">
            {found.people.map((p) => (
              <Row
                key={p.id}
                href={`/events?person=${p.id}`}
                avatar={<UserAvatar user={p.user} size={32} />}
                title={p.name}
                sub={`${p.shared} ${p.shared === 1 ? 'evento juntos' : 'eventos juntos'}`}
              />
            ))}
          </div>
        </>
      )}

      {nothing && (
        <p className="rounded-lg bg-cream-sunk px-[18px] py-[22px] text-center text-[13.5px] text-ink-500">
          Nada con «{q.trim()}».
        </p>
      )}
    </main>
  )
}
