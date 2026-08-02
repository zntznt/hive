import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/gate'
import EventForm from '@/app/club/[slug]/new-event/event-form'
import type { Place } from '@/components/ui/LocationPicker'
import { AppBar } from '@/components/ui/AppBar'
import { getT } from '@/lib/current-lang'

export default async function EditEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { t: tr } = await getT()
  const { supabase, profile } = await requireProfile()
  const { slug } = await params

  const { data: event } = await supabase.from('events').select('*, clubs(id, slug, name)').eq('slug', slug).maybeSingle()
  if (!event) redirect('/')
  const club = event.clubs as unknown as { id: string; slug: string; name: string } | null

  const { data: membership } = await supabase
    .from('event_members')
    .select('role')
    .eq('event_id', event.id)
    .eq('user_id', profile.id)
    .maybeSingle()
  const isOrganizer = event.organizer_user_id === profile.id || membership?.role === 'organizer' || profile.is_app_admin
  if (!isOrganizer || event.status === 'cancelled' || !club) redirect(`/e/${slug}`)

  const [{ data: categories }, { data: pastLocations }, { data: places }] = await Promise.all([
    supabase.from('event_categories').select('id, name, emoji').eq('club_id', club.id).order('name'),
    supabase.from('events').select('location').eq('club_id', club.id).not('location', 'is', null),
    supabase.from('saved_places').select('name, addr, query, lat, lng').eq('user_id', profile.id).order('created_at'),
  ])
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
      <AppBar title={tr('event.edit')} subtitle={event.title} backHref={`/e/${slug}`} />
      <main className="mx-auto w-full max-w-col px-4 pb-6">
      <EventForm
        clubId={club.id}
        slug={slug}
        categories={categories ?? []}
        savedPlaces={yourPlaces}
        recentPlaces={recentPlaces}
        initial={{
          id: event.id,
          title: event.title,
          category_id: event.category_id,
          location: event.location,
          lat: event.lat,
          lng: event.lng,
          allow_guests: event.allow_guests,
          maxGuestsPerMember: event.max_guests_per_member,
          capacity: event.capacity,
          waitlist_enabled: event.waitlist_enabled,
          confirm_deadline: event.confirm_deadline,
          join_policy: event.join_policy,
          status: event.status,
          sched_start_date: event.sched_start_date,
          sched_end_date: event.sched_end_date,
          sched_time_min: event.sched_time_min,
          sched_time_max: event.sched_time_max,
          sched_slot_minutes: event.sched_slot_minutes,
        }}
      />
    </main>
    </>
  )
}
