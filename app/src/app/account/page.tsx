import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import { Badge } from '@/components/ui/Badge'
import { SectionHeader } from '@/components/ui/SectionHeader'
import AvatarProfileForm from './avatar-profile-form'
import NotifPrefsForm from './notif-prefs-form'
import WhatsappForm from './whatsapp-form'
import PaymentMethodsForm, { type PaymentMethod } from './payment-methods-form'
import { SavedPlaces } from './saved-places'
import DangerZone from './danger-zone'

// Columns added by migration 0005 that aren't on the (still pre-redesign)
// Profile type in lib/types.ts - selected locally rather than editing that
// shared type.
type AccountExtra = {
  avatar_kind: 'bug' | 'photo'
  avatar_bug: string
  avatar_photo_url: string | null
  notif_email: boolean
  notif_whatsapp: boolean
  notif_prefs: Partial<Record<string, { email?: boolean; whatsapp?: boolean }>>
}

export default async function AccountPage() {
  const { supabase, profile } = await requireProfile()

  const [{ data: extra }, { data: methods }, { data: places }] = await Promise.all([
    supabase
      .from('users')
      .select('avatar_kind, avatar_bug, avatar_photo_url, notif_email, notif_whatsapp, notif_prefs')
      .eq('id', profile.id)
      .single(),
    supabase
      .from('payment_methods')
      .select('id, kind, value, sort')
      .eq('user_id', profile.id)
      .order('sort'),
    supabase.from('saved_places').select('id, name, addr, query').eq('user_id', profile.id).order('created_at'),
  ])

  const account = extra as AccountExtra | null
  const paymentMethods = (methods ?? []) as PaymentMethod[]

  return (
    <main className="mx-auto w-full max-w-md p-6">
      <header className="mb-6 flex items-baseline justify-between gap-3">
        <h1 className="font-display text-xl font-bold text-ink-900">Mi cuenta</h1>
        <Link href="/" className="shrink-0 text-sm font-semibold text-honey-700 underline">
          inicio
        </Link>
      </header>

      <AvatarProfileForm
        userId={profile.id}
        displayName={profile.display_name}
        avatarKind={account?.avatar_kind ?? 'bug'}
        avatarBug={account?.avatar_bug ?? 'bug'}
        avatarColor={profile.avatar_color ?? '#EBA937'}
        avatarPhotoUrl={account?.avatar_photo_url ?? null}
      />

      <section className="mb-6">
        <SectionHeader>Cómo entras</SectionHeader>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 rounded-md border border-line-card bg-paper px-3.5 py-2.5 text-sm">
            <span className="min-w-0 truncate text-ink-900">
              Correo <span className="text-ink-500">· {profile.email ?? 'sin correo'}</span>
            </span>
            <Badge tone="active">verificado</Badge>
          </div>
          <WhatsappForm phone={profile.phone_whatsapp} />
        </div>
        <p className="mt-2.5 text-xs text-ink-300">
          Hive solo usa enlaces mágicos por correo para entrar, no hay contraseñas.
        </p>
      </section>

      <PaymentMethodsForm methods={paymentMethods} />

      <SavedPlaces places={places ?? []} />

      <NotifPrefsForm
        notifEmail={account?.notif_email ?? true}
        notifWhatsapp={account?.notif_whatsapp ?? false}
        prefs={account?.notif_prefs ?? {}}
      />

      <DangerZone />
    </main>
  )
}
