import { requireProfile } from '@/lib/gate'
import { Badge } from '@/components/ui/Badge'
import { Page, PageHeader } from '@/components/ui/Page'
import AvatarProfileForm from './avatar-profile-form'
import WhatsappForm from './whatsapp-form'
import { NotificationsGroup } from './notifications-group'
import { LanguageControl } from './language-control'
import PaymentMethodsForm, { type PaymentMethod } from './payment-methods-form'
import { SavedPlaces, type Place as SavedPlace } from './saved-places'
import DangerZone from './danger-zone'
import { SummaryRow } from '@/components/ui/Density'
import { resolveLang, t } from '@/lib/lang'
import { headers } from 'next/headers'

// Columns added by migration 0005 that aren't on the (still pre-redesign)
// Profile type in lib/types.ts - selected locally rather than editing that
// shared type.
type AccountExtra = {
  avatar_kind: 'bug' | 'photo'
  avatar_bug: string
  avatar_photo_url: string | null
  notif_email: boolean
  notif_whatsapp: boolean
  notif_prefs: Partial<Record<string, { email?: boolean; whatsapp?: boolean; push?: boolean }>>
  phone_verified_at: string | null
  lang: 'es' | 'en' | null
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
      .select('avatar_kind, avatar_bug, avatar_photo_url, notif_email, notif_whatsapp, notif_prefs, phone_verified_at, lang')
      .eq('id', profile.id)
      .single(),
    supabase
      .from('payment_methods')
      .select('id, kind, value, sort')
      .eq('user_id', profile.id)
      .order('sort'),
    supabase
      .from('saved_places')
      .select('id, name, addr, query, lat, lng, area')
      .eq('user_id', profile.id)
      .order('created_at'),
    supabase.from('push_subscriptions').select('endpoint, device_label, device_key').eq('user_id', profile.id),
  ])

  const account = extra as AccountExtra | null
  const paymentMethods = (methods ?? []) as PaymentMethod[]
  // The override if there is one, else what the phone told the server it
  // reads. Resolved here so every string on the page comes from one answer.
  const lang = resolveLang(account?.lang ?? null, (await headers()).get('accept-language'))

  return (
    <Page>
      {/* Six groups, in the order the design gives them: who you are, how you
          get in, how Hive reaches you, how you get paid, where you can host,
          and the platform door if you have one. Groups sit 26px apart and
          sections inside one 18px, so the page has a shape before you read a
          word.

          Every control here commits the moment you touch it. There is no Save
          button anywhere on this page, because a Save button that saves only
          some of the page teaches people the rest is unsaved. */}
      <PageHeader title={t(lang, 'account.title')} lede={t(lang, 'account.lede')} />

      <GroupHeader>{t(lang, 'account.group.you')}</GroupHeader>

      <AvatarProfileForm
        userId={profile.id}
        displayName={profile.display_name}
        avatarKind={account?.avatar_kind ?? 'bug'}
        avatarBug={account?.avatar_bug ?? ''}
        avatarColor={profile.avatar_color ?? ''}
        avatarPhotoUrl={account?.avatar_photo_url ?? null}
        lang={lang}
        language={<LanguageControl value={(account?.lang as 'es' | 'en' | null) ?? null} lang={lang} />}
      />

      {/* Identities, not delivery. WhatsApp appears twice in this app: here as
          something you sign in with, and in the group below as somewhere
          messages arrive. Push is only ever the second, which is why it is no
          longer filed under this one. */}
      <GroupHeader>{t(lang, 'account.group.signin')}</GroupHeader>

      <section className="mt-2.5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 rounded-md border border-line-card bg-paper px-3.5 py-3 text-sm">
            <span className="min-w-0 truncate text-ink-900">
              {t(lang, 'account.email')}{' '}
              <span className="text-ink-500">· {profile.email ?? t(lang, 'account.email.none')}</span>
            </span>
            <Badge tone="success">{t(lang, 'account.verified')}</Badge>
          </div>
          <WhatsappForm phone={profile.phone_whatsapp} verifiedAt={account?.phone_verified_at ?? null} />
        </div>
        <p className="mt-2.5 text-xs text-ink-300">{t(lang, 'account.signin.note')}</p>
      </section>

      <GroupHeader>{t(lang, 'account.group.notify')}</GroupHeader>

      <NotificationsGroup
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''}
        devices={(pushDevices ?? []).map((d) => ({ endpoint: d.endpoint, label: d.device_label, key: d.device_key }))}
        notifEmail={account?.notif_email ?? true}
        notifWhatsapp={account?.notif_whatsapp ?? false}
        prefs={account?.notif_prefs ?? {}}
        hasWhatsapp={!!profile.phone_whatsapp}
      />

      <GroupHeader>{t(lang, 'account.group.money')}</GroupHeader>

      <PaymentMethodsForm methods={paymentMethods} />

      <GroupHeader>{t(lang, 'account.group.places')}</GroupHeader>

      <SavedPlaces places={(places ?? []) as SavedPlace[]} />

      {/* The platform door lives here, with the rest of the account, not on
          Home. Home is a hub for what is happening in your clubs, and a
          platform-admin door is neither news nor next. A club role reaches
          none of it. */}
      {profile.is_app_admin && (
        <>
          <GroupHeader>{t(lang, 'account.group.platform')}</GroupHeader>
          <div className="mt-2.5">
            <SummaryRow
              icon="shield-halved"
              label={t(lang, 'platform.door')}
              meta={t(lang, 'platform.meta')}
              href="/admin"
            />
          </div>
        </>
      )}

      <DangerZone />
    </Page>
  )
}
