import { requireProfile } from '@/lib/gate'
import EventForm from './event-form'
import type { Place } from '@/components/ui/LocationPicker'
import { AppBar } from '@/components/ui/AppBar'
import { getT } from '@/lib/current-lang'

export default async function NewEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { t: tr } = await getT()
  const { supabase, profile } = await requireProfile()
  const { slug } = await params
  const { data: club } = await supabase.from('clubs').select('*').eq('slug', slug).maybeSingle()
  if (!club) {
    return (
      <main className="mx-auto max-w-col px-4 pb-6 pt-5">
        <p className="text-ink-700">{tr('club.notMemberShort')}</p>
      </main>
    )
  }
  const [{ data: categories }, { data: pastLocations }, { data: places }] = await Promise.all([
    supabase.from('event_categories').select('id, name, emoji').eq('club_id', club.id).order('name'),
    supabase.from('events').select('location').eq('club_id', club.id).not('location', 'is', null),
    supabase.from('saved_places').select('name, addr, query, lat, lng').eq('user_id', profile.id).order('created_at'),
  ])
  // "your places" (saved on Account, usable across every club) show as a
  // starred group; this club's own past locations fill the recents group.
  // A saved place carries its pin into the event, so reusing one does not
  // throw away the point somebody already dropped.
  const yourPlaces: Place[] = (places ?? []).map((p) => ({
    name: p.name,
    addr: p.addr ?? undefined,
    q: p.query,
    lat: p.lat,
    lng: p.lng,
  }))
  const recentPlaces: Place[] = [...new Set((pastLocations ?? []).map((e) => e.location as string))]
    .filter((n) => !yourPlaces.some((p) => p.name === n))
    .slice(0, 6)
    .map((n) => ({ name: n, q: n }))

  return (
    <>
      <AppBar title={tr('club.newEvent.title')} subtitle={club.name} subtitleHref={`/club/${slug}`} backHref={`/club/${slug}`} />
      <main className="mx-auto w-full max-w-col px-4 pb-6">
      <EventForm clubId={club.id} slug={slug} categories={categories ?? []} savedPlaces={yourPlaces} recentPlaces={recentPlaces} />
    </main>
    </>
  )
}
