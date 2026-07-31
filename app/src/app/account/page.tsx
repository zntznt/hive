import Link from 'next/link'
import { requireProfile } from '@/lib/gate'
import { Badge } from '@/components/ui/Badge'
import { Page, PageHeader } from '@/components/ui/Page'
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
  phone_verified_at: string | null
}

// The group label: heavier than a section eyebrow because it is naming a set
// of them, and it is the only thing giving this page a shape.
function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-[26px] border-t border-line-card pt-[13px] font-display text-[15px] font-bold text-ink-900">
      {children}
    </h2>
  )
}

export default async function AccountPage() {
  const { supabase, profile } = await requireProfile()

  const [{ data: extra }, { data: methods }, { data: places }] = await Promise.all([
    supabase
      .from('users')
      .select('avatar_kind, avatar_bug, avatar_photo_url, notif_email, notif_whatsapp, notif_prefs, phone_verified_at')
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
    <Page>
      {/* the order is who you are, how you get in, what you have saved, what
          reaches you, and the way out. Sections inside a group sit 18px
          apart, groups 28px, so the page has a shape before you read a word */}
      <PageHeader
        title="Mi cuenta"
        action={
          <Link href="/" className="tap shrink-0 text-sm font-semibold text-honey-700 underline">
            inicio
          </Link>
        }
      />

      <AvatarProfileForm
        userId={profile.id}
        displayName={profile.display_name}
        avatarKind={account?.avatar_kind ?? 'bug'}
        avatarBug={account?.avatar_bug ?? 'bug'}
        avatarColor={profile.avatar_color ?? '#EBA937'}
        avatarPhotoUrl={account?.avatar_photo_url ?? null}
      />

      {/* Rule 6, on a page with no live state to vary the shapes: five equal
          sections in a column all look equally important, which is how you end
          up opening three to find one. Two named groups instead, and the
          values stay on the rows so you can check a setting without opening
          it. Nothing here collapses: the whole page is short and every
          section is something you might be part-way through. */}
      <GroupHeader>Cómo Hive te encuentra</GroupHeader>

      <section className="mt-2.5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 rounded-md border border-line-card bg-paper px-3.5 py-2.5 text-sm">
            <span className="min-w-0 truncate text-ink-900">
              Correo <span className="text-ink-500">· {profile.email ?? 'sin correo'}</span>
            </span>
            <Badge tone="success">verificado</Badge>
          </div>
          <WhatsappForm phone={profile.phone_whatsapp} verifiedAt={account?.phone_verified_at ?? null} />
        </div>
        <p className="mt-2.5 text-xs text-ink-300">
          Entras con un enlace a tu correo o con un código por WhatsApp. No hay contraseñas.
        </p>
      </section>

      <NotifPrefsForm
        notifEmail={account?.notif_email ?? true}
        notifWhatsapp={account?.notif_whatsapp ?? false}
        prefs={account?.notif_prefs ?? {}}
      />

      <GroupHeader>Dinero y lugares</GroupHeader>

      <PaymentMethodsForm methods={paymentMethods} />

      <SavedPlaces places={places ?? []} />

      <DangerZone />
    </Page>
  )
}
