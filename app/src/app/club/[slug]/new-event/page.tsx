import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import EventForm from './event-form'
import type { Place } from '@/components/ui/LocationPicker'

export default async function NewEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { supabase, profile } = await requireProfile()
  const { slug } = await params
  const { data: club } = await supabase.from('clubs').select('*').eq('slug', slug).maybeSingle()
  if (!club) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="text-ink-700">Este club no existe o no eres miembro.</p>
      </main>
    )
  }
  const [{ data: categories }, { data: pastLocations }, { data: places }] = await Promise.all([
    supabase.from('event_categories').select('id, name, emoji').eq('club_id', club.id).order('name'),
    supabase.from('events').select('location').eq('club_id', club.id).not('location', 'is', null),
    supabase.from('saved_places').select('name, addr, query').eq('user_id', profile.id).order('created_at'),
  ])
  // "your places" (saved on Account, usable across every club) show as a
  // starred group; this club's own past locations fill the recents group.
  const yourPlaces: Place[] = (places ?? []).map((p) => ({ name: p.name, addr: p.addr ?? undefined, q: p.query }))
  const recentPlaces: Place[] = [...new Set((pastLocations ?? []).map((e) => e.location as string))]
    .filter((n) => !yourPlaces.some((p) => p.name === n))
    .slice(0, 6)
    .map((n) => ({ name: n, q: n }))

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-xl font-bold text-ink-900">Nuevo evento · {club.name}</h1>
        <Link href={`/club/${slug}`} className="text-sm text-ink-500">
          volver
        </Link>
      </header>
      <EventForm clubId={club.id} slug={slug} categories={categories ?? []} savedPlaces={yourPlaces} recentPlaces={recentPlaces} />
    </main>
  )
}
