'use client'

import { InstallPwa } from '@/components/ui/InstallPwa'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { savePushSubscription, removePushSubscription, sendTestPush } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Badge } from '@/components/ui/Badge'
import { useLang, useT, useTf } from '@/components/ui/LangProvider'
import { COMPLETE_LANGS, t as translate, tf as format, type Lang } from '@/lib/lang'

// Avisos en este dispositivo.
//
// Sits under the WhatsApp row and copies its shape on purpose: label, badge,
// bordered action. The action is a bordered pill and never a hover underline,
// because an affordance that only exists on hover does not exist on a phone.
//
// Every state names the device. Correo and WhatsApp belong to a person; push
// belongs to one browser on one machine, so a row that just said "activado"
// would be wrong on the same person's other phone.
//
// The one state worth designing for is `denied`. A browser asks once and
// remembers forever, so this never opens the native prompt on load, and when
// permission is refused it stops being an error message and becomes a repair
// manual.

// 'checking' is the state before the answer is known. Everything this row can
// say depends on the browser, so none of it can be said until the effect has
// looked, and the wrong answer for a beat is worse than no answer: starting at
// 'unsupported' meant every visit flashed "Este navegador no admite avisos"
// before correcting itself.
type State = 'checking' | 'unsupported' | 'install' | 'default' | 'granted' | 'denied'

// Takes the translator rather than calling the hook: this is a plain function,
// not a component, and a hook in here is a rules-of-hooks violation waiting to
// fire on the first re-render.
// What browser and machine this is, read once.
//
// Two things are built from it and they must not drift: the key, which is how
// a stored subscription is recognised as this browser's, and the label, which
// is the sentence a person reads. The label used to be both, and a label is
// display copy: it is written in whatever language the member was in when they
// subscribed, so somebody who had since switched saw their own machine listed
// twice, once as "Chrome en este equipo · activado" and once as "Chrome on
// this device · off".
//
// The endpoint cannot do this job. It is null until a live subscription
// resolves and there is none when permission is blocked, which is exactly when
// a stale row for this browser is still in the table.
function deviceParts() {
  const ua = navigator.userAgent
  const browser = /EdgiOS|Edg/.test(ua)
    ? 'Edge'
    : /CriOS|Chrome/.test(ua)
      ? 'Chrome'
      : /FxiOS|Firefox/.test(ua)
        ? 'Firefox'
        : /Safari/.test(ua)
          ? 'Safari'
          : null
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Macintosh/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : null
  return { browser, os }
}

// Untranslated, lowercase, and never shown: "chrome|mac". An unrecognised
// browser or platform keeps a stable placeholder rather than borrowing the
// copy, so two members on the same oddity still land on the same key.
export function deviceKey() {
  const { browser, os } = deviceParts()
  return `${(browser ?? 'browser').toLowerCase()}|${(os ?? 'device').toLowerCase()}`
}

function deviceLabel(lang: Lang) {
  const { browser, os } = deviceParts()
  return format(lang, 'push.onDevice', {
    browser: browser ?? translate(lang, 'push.thisBrowser'),
    os: os ?? translate(lang, 'account.thisDevice'),
  })
}

// Every name this browser goes by, for rows written before device_key existed.
// They age out on their own: a subscription is rewritten whenever the browser
// re-registers, and that write carries the key.
const deviceNames = () => COMPLETE_LANGS.map(deviceLabel)

// The push service hands back the keys as ArrayBuffers; the server stores them
// base64url, which is what the encryption expects on the way out.
function b64(buf: ArrayBuffer | null) {
  if (!buf) return ''
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function urlBase64ToUint8Array(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function PushRow({
  vapidPublicKey,
  devices,
  onState,
}: {
  vapidPublicKey: string
  devices: { endpoint: string; label: string | null; key: string | null }[]
  // Reported upward so the notification matrix can draw push as a dead column
  // when this browser cannot ring. Whether it can is a fact about the browser,
  // discovered here, and the matrix must not go and ask a second time.
  onState?: (s: {
    live: boolean
    state: State
    deviceName: string
    reason: string | null
    devices: { endpoint: string; label: string | null; key: string | null }[]
  }) => void
}) {
  const tr = useT()
  const tf = useTf()
  const lang = useLang()
  const [state, setState] = useState<State>('checking')
  const [showInstall, setShowInstall] = useState(false)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [label, setLabel] = useState(tr('account.thisDevice'))
  // every name this browser goes by, for recognising its own stored rows
  const [aliases, setAliases] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    async function look() {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
      const ua = navigator.userAgent
      // named before any of the early returns below, because every state says
      // the device out loud and the "other devices" line is filtered by it
      if (!cancelled) {
        setLabel(deviceLabel(lang))
        setAliases(deviceNames())
      }
      const isIos = /iPhone|iPad|iPod/.test(ua)
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true

      // iOS gives a site no push at all until it is on the home screen. Saying
      // "no compatible" there would be wrong: it is one step away.
      if (isIos && !standalone) {
        if (!cancelled) setState('install')
        return
      }
      if (!supported || !vapidPublicKey) {
        if (!cancelled) setState('unsupported')
        return
      }

      const perm = Notification.permission
      let ep: string | null = null
      if (perm === 'granted') {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js')
        const existing = await reg?.pushManager.getSubscription()
        ep = existing?.endpoint ?? null
      }
      if (cancelled) return
      setState(perm === 'granted' ? (ep ? 'granted' : 'default') : perm === 'denied' ? 'denied' : 'default')
      setEndpoint(ep)
    }
    look()
    return () => {
      cancelled = true
    }
  }, [vapidPublicKey, lang])

  async function enable() {
    setBusy(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      // asked only on a tap, never on load: a browser asks once and remembers
      // the answer forever, so a prompt nobody was expecting loses the channel
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'default')
        return
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }))
      await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: b64(sub.getKey('p256dh')),
        auth: b64(sub.getKey('auth')),
        deviceLabel: deviceLabel(lang),
        deviceKey: deviceKey(),
      })
      setEndpoint(sub.endpoint)
      setState('granted')
      toast(tr('push.turnedOn'))
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('push.failOn'))
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    if (!endpoint) return
    setBusy(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await reg?.pushManager.getSubscription()
      await sub?.unsubscribe()
      await removePushSubscription(endpoint)
      setEndpoint(null)
      setState('default')
      toast(tr('push.turnedOff'))
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('push.failOff'))
    } finally {
      setBusy(false)
    }
  }

  function test() {
    if (!endpoint) return
    startTransition(async () => {
      const res = await sendTestPush(endpoint)
      if (res.ok) toast(tr('push.onTheWay'))
      else setError(res.error)
    })
  }

  // tr('push.alsoOn') is for the person's other phones, so it has to
  // exclude this one. Matching on endpoint alone is not enough: a browser can
  // drop its subscription on its own (storage cleared, the push service
  // rotating it) and leave the row on the server behind, and then this device
  // has no endpoint to compare against and matches nothing. The result read as
  // "Avisos en Chrome en este equipo / Activar" sitting directly above "También
  // activado en: Chrome en este equipo". The label is what names a device to
  // the person, so the label is what has to be unique here. The dead row gets
  // cleaned up the next time something is sent to it, which is soon enough.
  // The reason, in the words the matrix prints under its table. Kept next to
  // the states it describes so a new state cannot be added without one.
  const REASON: Record<string, string | null> = {
    checking: null,
    granted: null,
    default: tr('push.off'),
    denied: tr('push.denied'),
    install: tr('push.install'),
    unsupported: tr('push.unsupported'),
  }
  // Everyone but this browser, one row per device, and it is computed here
  // because this is the only place that knows which endpoint is this browser.
  // The list below used to be handed all of them and work it out again, which
  // it could not: it drew this device's stored row as "activado" next to the
  // banner saying push here was blocked, and drew a second row for the same
  // browser when there were two subscriptions from it.
  const otherDevices = useMemo(() => {
    // The key when the row has one, the name when it does not, which is only
    // rows written before 0060 added the column.
    const mine = aliases.length ? deviceKey() : null
    const isThisBrowser = (d: { label: string | null; key: string | null }) =>
      d.key ? d.key === mine : !!d.label && aliases.includes(d.label)
    const seen = new Set<string>()
    return devices
      .filter((d) => d.endpoint !== endpoint && !isThisBrowser(d))
      .filter((d) => {
        // One browser is one row. A device that re-subscribed after its site
        // data was cleared leaves the old endpoint behind, and two rows with
        // the same name and the same answer are a readout, not information.
        const key = d.label ?? d.endpoint
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [devices, endpoint, aliases])

  const reportedRef = useRef('')
  useEffect(() => {
    const next = `${state}|${label}|${otherDevices.map((d) => d.label ?? d.endpoint).join(',')}`
    if (reportedRef.current === next) return
    reportedRef.current = next
    onState?.({ live: state === 'granted', state, deviceName: label, reason: REASON[state] ?? null, devices: otherDevices })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, label, otherDevices])

  const pill =
    'tap inline-flex min-h-11 flex-shrink-0 items-center rounded-pill border-[1.5px] border-line-card bg-paper px-3.5 text-[12.5px] font-bold text-ink-900'

  return (
    <div id="push-row" className="border-t border-line-divider px-[13px] py-[11px]">
      <div className="flex items-center justify-between gap-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-ink-900">{tf('push.alertsIn', { device: label })}</span>
          {/* A badge in every state. Two of the five had one, so in off,
              needs-install and unsupported the row's state had to be inferred
              from the help text and it stopped reading as the same object as
              the WhatsApp row above it. */}
          {state === 'granted' && <Badge tone="success">{tr('push.on')}</Badge>}
          {state === 'denied' && <Badge tone="danger">{tr('push.blocked')}</Badge>}
          {state === 'default' && <Badge tone="neutral">{tr('push.badge.off')}</Badge>}
          {state === 'install' && <Badge tone="warning">{tr('push.badge.install')}</Badge>}
          {state === 'unsupported' && <Badge tone="neutral">{tr('push.incompatible')}</Badge>}
        </span>
        {state === 'granted' ? (
          <span className="flex flex-shrink-0 gap-2">
            <button type="button" onClick={test} disabled={pending} className={pill}>
              {pending ? tr('common.sending') : tr('push.test')}
            </button>
            <button type="button" onClick={disable} disabled={busy} className={pill}>
              {tr('common.off')}
            </button>
          </span>
        ) : state === 'default' ? (
          <button type="button" onClick={enable} disabled={busy} className={pill}>
            {busy ? tr('push.turningOn') : tr('push.enable')}
          </button>
        ) : state === 'install' ? (
          // On an iPhone not yet on the Home Screen this was described and
          // never offered. The card that explains how already exists.
          <button type="button" onClick={() => setShowInstall(true)} className={pill}>
            {tr('pwa.title')}
          </button>
        ) : null}
      </div>

      {showInstall && (
        <div className="mt-2.5">
          <InstallPwa />
        </div>
      )}

      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-300">
        {state === 'granted' ? (
          <>{tr('push.working')}</>
        ) : state === 'default' ? (
          <>{tr('push.what')}</>
        ) : state === 'install' ? (
          <>
            {tr('push.iosHint')}
          </>
        ) : state === 'denied' ? (
          <>{tr('push.blocked.help')}</>
        ) : state === 'unsupported' ? (
          <>{tr('push.unsupported.note')}</>
        ) : (
          // 'checking': the line keeps its height so the rows under it do not
          // jump when the answer arrives a frame later
          <>&nbsp;</>
        )}
      </p>

      {/* Not an error message, a repair manual. The browser will not ask
          again, so the only way back is through its own settings, and the
          steps differ per browser. */}
      {state === 'denied' && (
        <ol className="mt-2.5 flex flex-col gap-1.5 rounded-md bg-cream-sunk px-3.5 py-3 text-xs leading-relaxed text-ink-700">
          <li>{tr('push.step1')}</li>
          <li>{tr('push.step2')}</li>
          <li>{tr('push.step3')}</li>
          <li className="text-ink-300">
            {tr('push.meanwhile')}
          </li>
        </ol>
      )}

      {otherDevices.length > 0 && (
        <p className="mt-2 text-[11.5px] text-ink-300">
          {tf('push.alsoOn', { devices: otherDevices.map((d) => d.label ?? tr('account.device.other')).join(', ') })}
        </p>
      )}

      {error && <p className="mt-2 rounded-md bg-danger-bg p-2.5 text-xs text-danger">{error}</p>}
    </div>
  )
}
