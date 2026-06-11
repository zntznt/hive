import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import { createClub } from '@/app/actions'

export default async function NewClubPage() {
  await requireProfile()
  return (
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-stone-800">Nuevo club</h1>
        <Link href="/" className="text-sm text-stone-500 underline">
          inicio
        </Link>
      </header>
      <form action={createClub} className="space-y-3">
        <label className="block text-sm text-stone-600" htmlFor="name">
          Nombre del club
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="Los Jueves"
          className="w-full rounded-xl border border-stone-300 bg-white p-3 outline-amber-500"
        />
        <button className="w-full rounded-xl bg-amber-500 p-3 font-medium text-white hover:bg-amber-600">
          Crear club
        </button>
        <p className="text-xs text-stone-400">
          Serás admin del club. Después podrás crear categorías (juegos, cine…), eventos e
          invitar gente.
        </p>
      </form>
    </main>
  )
}
