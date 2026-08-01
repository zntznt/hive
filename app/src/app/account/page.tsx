import { requireProfile } from '@/lib/gate'
import { Badge } from '@/components/ui/Badge'
import { Page, PageHeader } from '@/components/ui/Page'
import AvatarProfileForm from './avatar-profile-form'
import NotifPrefsForm from './notif-prefs-form'
import WhatsappForm from './whatsapp-form'
import { PushRow } from './push-row'
import PaymentMethodsForm, { type PaymentMethod } from './payment-methods-form'
import { SavedPlaces, type Place as SavedPlace } from './saved-places'
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

// The group label. The page is four questions in a row and this is what
// separates them, so it reads as a label rather than as a heading with content
// of its own.
function GroupHeader({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow mt-[26px] mb-2.5">{children}</p>
}

export default async function AccountPage() {
  const { supabase, profile } = await requireProfile()

  const [{ data: extra }, { data: methods }, { data: places }, { data: pushDevices }] = await Promise.all([
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
    supabase
      .from('saved_places')
      .select('id, name, addr, query, lat, lng')
      .eq('user_id', profile.id)
      .order('created_at'),
    supabase.from('push_subscriptions').select('endpoint, device_label').eq('user_id', profile.id),
  ])

  const account = extra as AccountExtra | null
  const paymentMethods = (methods ?? []) as PaymentMethod[]

  return (
    <Page>
      {/* the order is who you are, how you get in, what you have saved, what
          reaches you, and the way out. Sections inside a group sit 18px
          apart, groups 28px, so the page has a shape before you read a word */}
      {/* The lede names the four things on the page, so the group labels below
          are confirming an order you already have rather than announcing one.
          The "inicio" link that used to sit up here was a third way back on a
          screen that already has a tab bar and the phone's own back gesture. */}
      <PageHeader title="Mi cuenta" lede="Tu bicho, cómo entras, cómo te avisamos y cómo te pagan." />

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
      <GroupHeader>Cómo entras</GroupHeader>

      <section className="mt-2.5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 rounded-md border border-line-card bg-paper px-3.5 py-2.5 text-sm">
            <span className="min-w-0 truncate text-ink-900">
              Correo <span className="text-ink-500">· {profile.email ?? 'sin correo'}</span>
            </span>
            <Badge tone="success">verificado</Badge>
          </div>
          <WhatsappForm phone={profile.phone_whatsapp} verifiedAt={account?.phone_verified_at ?? null} />
          {/* Directly under WhatsApp and shaped like it, because it answers the
              same question. It is the one channel that is per browser rather
              than per person, which is what the copy has to keep saying. */}
          <div className="overflow-hidden rounded-md border border-line-card bg-paper">
            <PushRow
              vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''}
              devices={(pushDevices ?? []).map((d) => ({ endpoint: d.endpoint, label: d.device_label }))}
            />
          </div>
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

      <SavedPlaces places={(places ?? []) as SavedPlace[]} />

      <DangerZone />
    </Page>
  )
}
