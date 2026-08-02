'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { savePushSubscription, removePushSubscription, sendTestPush } from '@/app/actions'
import { useToast } from '@/components/ui/Toast'
import { Badge } from '@/components/ui/Badge'
import { useT, useTf } from '@/components/ui/LangProvider'
import type { StringKey } from '@/lib/lang'

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
function deviceLabel(tr: (k: StringKey) => string, tf: (k: StringKey, v: Record<string, string | number>) => string) {
  const ua = navigator.userAgent
  const browser = /EdgiOS|Edg/.test(ua)
    ? 'Edge'
    : /CriOS|Chrome/.test(ua)
      ? 'Chrome'
      : /FxiOS|Firefox/.test(ua)
        ? 'Firefox'
        : /Safari/.test(ua)
          ? 'Safari'
          : tr('push.thisBrowser')
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Macintosh/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : tr('account.thisDevice')
  return tf('push.onDevice', { browser, os })
}

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
  devices: { endpoint: string; label: string | null }[]
  // Reported upward so the notification matrix can draw push as a dead column
  // when this browser cannot ring. Whether it can is a fact about the browser,
  // discovered here, and the matrix must not go and ask a second time.
  onState?: (s: { live: boolean; deviceName: string; reason: string | null }) => void
}) {
  const tr = useT()
  const tf = useTf()
  const [state, setState] = useState<State>('checking')
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [label, setLabel] = useState(tr('account.thisDevice'))
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
      if (!cancelled) setLabel(deviceLabel(tr, tf))
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
  }, [vapidPublicKey])

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
        deviceLabel: deviceLabel(tr, tf),
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
      if (res.ok) toast('Va en camino.')
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
  const reportedRef = useRef('')
  useEffect(() => {
    const next = `${state}|${label}`
    if (reportedRef.current === next) return
    reportedRef.current = next
    onState?.({ live: state === 'granted', deviceName: label, reason: REASON[state] ?? null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, label])

  const otherDevices = devices.filter((d) => d.endpoint !== endpoint && d.label !== label)

  const pill =
    'tap inline-flex min-h-11 flex-shrink-0 items-center rounded-pill border-[1.5px] border-line-card bg-paper px-3.5 text-[12.5px] font-bold text-ink-900'

  return (
    <div className="border-t border-line-divider px-[13px] py-[11px]">
      <div className="flex items-center justify-between gap-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-ink-900">{tf('push.alertsIn', { device: label })}</span>
          {state === 'granted' && <Badge tone="success">{tr('push.on')}</Badge>}
          {state === 'denied' && <Badge tone="danger">{tr('push.blocked')}</Badge>}
        </span>
        {state === 'granted' ? (
          <span className="flex flex-shrink-0 gap-2">
            <button type="button" onClick={test} disabled={pending} className={pill}>
              {pending ? 'Enviando…' : 'Probar'}
            </button>
            <button type="button" onClick={disable} disabled={busy} className={pill}>
              Apagar
            </button>
          </span>
        ) : state === 'default' ? (
          <button type="button" onClick={enable} disabled={busy} className={pill}>
            {busy ? tr('push.turningOn') : tr('push.enable')}
          </button>
        ) : null}
      </div>

      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-300">
        {state === 'granted' ? (
          <>{tr('push.working')}</>
        ) : state === 'default' ? (
          <>{tr('push.what')}</>
        ) : state === 'install' ? (
          <>
            En iPhone hay que agregar Hive a la pantalla de inicio antes de poder activar los avisos. Toca Compartir y
            luego &quot;Agregar a inicio&quot;.
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
          También activado en: {otherDevices.map((d) => d.label ?? 'otro dispositivo').join(', ')}.
        </p>
      )}

      {error && <p className="mt-2 rounded-md bg-danger-bg p-2.5 text-xs text-danger">{error}</p>}
    </div>
  )
}
