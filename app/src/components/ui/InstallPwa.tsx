'use client'

import { useEffect, useState } from 'react'
import { BrandMark } from '@/components/ui/BrandMark'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/components/ui/LangProvider'

// "Add it to your phone", which is the whole of the PWA story here: the app is
// a column of screens people open between other things, and a home-screen icon
// is the difference between opening it and remembering the URL.
//
// Two variants because the platforms genuinely differ. Android fires
// beforeinstallprompt and hands us a prompt we can call; iOS has no install
// API at all, so the honest thing is to name the three taps in Safari's own
// words rather than draw a button that cannot work. Already installed renders
// nothing: a card telling you to install the app you are inside of is noise.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

// Dismissal has to outlive the render, or the card comes back on every
// navigation. It is a preference, not data, so it lives in the browser.
const DISMISSED = 'hive.install.dismissed'

type Shown = { platform: 'none' | 'android' | 'ios'; dismissed: boolean }

export function InstallPwa() {
  const tr = useT()
  const [deferred, setDeferred] = useState<InstallEvent | null>(null)
  // starts hidden and only ever opens: whether to show this depends on
  // localStorage, the user agent and a Chrome event, none of which exist
  // during SSR, so rendering it first and hiding it later would be a flash
  const [shown, setShown] = useState<Shown>({ platform: 'none', dismissed: true })

  useEffect(() => {
    // display-mode: standalone is what "installed" means on both platforms,
    // plus navigator.standalone for older iOS
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return

    const ua = window.navigator.userAgent
    const isIos = /iPad|iPhone|iPod/.test(ua)
    // Chrome on iOS cannot add to the home screen either, and its share sheet
    // has no such item, so telling anyone but Safari to look for it is a lie
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    const dismissed = localStorage.getItem(DISMISSED) === '1'

    // one-time sync from non-React browser APIs on mount, the documented
    // exception to "don't setState in effects" (same as signin.tsx)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown({ platform: isIos && isSafari ? 'ios' : 'none', dismissed })

    const onPrompt = (e: Event) => {
      // Chrome shows its own mini-infobar unless this is prevented, and then
      // there are two prompts saying the same thing
      e.preventDefault()
      setDeferred(e as InstallEvent)
      setShown((s) => ({ ...s, platform: 'android' }))
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const { platform, dismissed } = shown

  function hide() {
    localStorage.setItem(DISMISSED, '1')
    setShown((s) => ({ ...s, dismissed: true }))
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    // the event is single use: Chrome will fire a fresh one if it is still
    // installable, so dropping it here is what keeps the card honest
    setDeferred(null)
  }

  if (dismissed || platform === 'none') return null

  return (
    <div className="mb-[26px] rounded-lg border border-line-card bg-paper px-4 py-[15px]">
      <div className="flex items-start gap-2.5">
        <span className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-sm bg-honey-100 text-sm text-honey-800">
          <Icon name="mobile-screen-button" size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold leading-tight text-ink-900">{tr('pwa.title')}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
            Agrégalo a tu pantalla de inicio y se abre como cualquier otra app, sin buscar el enlace.
          </p>
        </div>
        <button
          type="button"
          onClick={hide}
          aria-label={tr('pwa.hide')}
          className="tap -mr-1 -mt-1 grid h-8 w-8 flex-shrink-0 place-items-center rounded-sm text-ink-300"
        >
          <Icon name="xmark" size={12} />
        </button>
      </div>

      {platform === 'android' ? (
        <button
          type="button"
          onClick={install}
          className="tap mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-pill bg-honey-500 px-4 text-[13.5px] font-extrabold text-charcoal shadow-lip"
        >
          Agregar a la pantalla de inicio
        </button>
      ) : (
        // No button on purpose: iOS has no install API, so the only true thing
        // to do is name the taps and the glyph to hunt for in Safari's bar.
        <ol className="mt-3 flex flex-col gap-2 text-[13px] leading-relaxed text-ink-700">
          <li className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-sm bg-cream-sunk text-ink-500">
              <Icon name="arrow-up-from-bracket" size={11} />
            </span>
            Toca Compartir, abajo en Safari.
          </li>
          <li className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-sm bg-cream-sunk text-ink-500">
              <Icon name="square-plus" size={11} />
            </span>
            Elige &quot;Agregar a inicio&quot;.
          </li>
          <li className="flex items-center gap-2.5">
            {/* The mark, because this step is "look for this on your home
                screen". It takes the row's colour like the two glyphs above
                it: the sunk square is the step's tile, not a plate under the
                logo, and honey here would make the third step shout. */}
            <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-sm bg-cream-sunk text-ink-500">
              <BrandMark size={12} tone="inherit" showWordmark={false} />
            </span>
            Ábrelo desde ahí y ya está.
          </li>
        </ol>
      )}
    </div>
  )
}
