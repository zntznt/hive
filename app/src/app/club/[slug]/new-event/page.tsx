import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import EventForm from './event-form'

export default async function NewEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { supabase } = await requireProfile()
  const { slug } = await params
  const { data: club } = await supabase.from('clubs').select('*').eq('slug', slug).maybeSingle()
  if (!club) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="text-stone-600">Este club no existe o no eres miembro.</p>
      </main>
    )
  }
  const { data: categories } = await supabase
    .from('event_categories')
    .select('id, name, emoji')
    .eq('club_id', club.id)
    .order('name')

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-stone-800">Nuevo evento · {club.name}</h1>
        <Link href={`/club/${slug}`} className="text-sm text-stone-500 underline">
          volver
        </Link>
      </header>
      <EventForm clubId={club.id} slug={slug} categories={categories ?? []} />
    </main>
  )
}
