import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import { createClub } from '@/app/actions'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default async function NewClubPage() {
  await requireProfile()
  return (
    <main className="mx-auto w-full max-w-col px-4 pb-6 pt-5">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-xl font-bold text-ink-900">Nuevo club</h1>
        <Link href="/" className="tap text-sm text-ink-500 underline">
          inicio
        </Link>
      </header>
      <Card>
        <form action={createClub} className="space-y-4">
          <Input id="name" name="name" label="Nombre del club" required placeholder="Los Jueves" />
          <Button block>Crear club</Button>
          <p className="text-xs text-ink-500">
            Serás admin del club. Después podrás crear categorías (juegos, cine…), eventos e
            invitar gente.
          </p>
        </form>
      </Card>
    </main>
  )
}
