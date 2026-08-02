'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { useT } from '@/components/ui/LangProvider'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import { rotateClubCalendarToken } from '@/app/actions'

// Subscribe once and the club's events keep arriving. The per-event .ics is a
// download that stops knowing anything the moment a time moves; this is the
// standing subscription that fixes itself.
//
// The link is a credential: a calendar app carries no session, so whoever holds
// the URL reads the schedule whether or not they ever joined. Admins can
// therefore rotate it, and the confirmation says the part that actually costs
// something, which is that everyone subscribed has to add it again.

export function CalendarSubscribe({
  clubName,
  clubId,
  slug,
  feedUrl,
  isAdmin,
}: {
  clubName: string
  clubId: string
  slug: string
  // absolute, and built on the server: reading window.location here rendered
  // one string during SSR and another after mount, which React reports as a
  // hydration mismatch and repairs by throwing the tree away
  feedUrl: string
  isAdmin: boolean
}) {
  const tr = useT()
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const toast = useToast()

  const httpUrl = feedUrl
  // webcal:// is what hands the URL to the calendar app instead of the browser
  const webcal = httpUrl.replace(/^https?:\/\//, 'webcal://')

  async function copy() {
    try {
      await navigator.clipboard.writeText(httpUrl)
      toast(tr('club.linkCopied'))
    } catch {
      toast(tr('club.cal.copyFailed'))
    }
  }

  function rotate() {
    setError(null)
    startTransition(async () => {
      try {
        await rotateClubCalendarToken(clubId, slug)
        setConfirming(false)
        toast(tr('club.cal.newLink'))
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : tr('club.cal.changeFailed'))
      }
    })
  }

  return (
    <div className="rounded-lg border border-line-card bg-paper px-4 py-[15px]">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-sm bg-honey-100 text-sm text-honey-800">
          <Icon name="calendar-days" size={14} />
        </span>
        <span className="min-w-0">
          <span className="block font-display text-base font-bold leading-tight text-ink-900">
            Suscríbete a {clubName}
          </span>
          <span className="mt-1 block text-[13px] leading-relaxed text-ink-700">
            Agrégalo una vez y cada evento del club aparece solo en tu calendario.
          </span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={webcal}
          className="tap inline-flex min-h-11 flex-1 basis-[150px] items-center justify-center rounded-pill bg-honey-500 px-4 text-[13.5px] font-extrabold text-charcoal shadow-lip"
        >
          Suscribirme
        </a>
        <button
          type="button"
          onClick={copy}
          className="tap inline-flex min-h-11 flex-1 basis-[120px] items-center justify-center rounded-pill border-[1.5px] border-line-card bg-paper px-4 text-[13.5px] font-bold text-ink-900"
        >
          Copiar enlace
        </button>
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-ink-300">
        Los eventos nuevos, los cambios de hora y las cancelaciones llegan solos. Tu calendario se actualiza por su
        cuenta, normalmente en unas horas. Puedes quitarlo desde ahí cuando quieras.
      </p>

      <div className="mt-3 border-t border-line-divider pt-3">
        <div className="flex items-center gap-2 text-xs text-ink-500">
          <Icon name="link" size={11} />
          <span className="min-w-0 flex-1 truncate">{httpUrl.replace(/^https?:\/\//, '')}</span>
        </div>
        {isAdmin && (
          <div className="mt-2.5">
            <p className="mb-2 text-xs leading-relaxed text-ink-300">
              Quien tenga este enlace puede ver el calendario del club sin ser miembro. Cámbialo si se compartió de
              más.
            </p>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="tap inline-flex min-h-11 items-center gap-2 rounded-pill border-[1.5px] border-line-card bg-paper px-[15px] text-[12.5px] font-bold text-ink-900"
            >
              <Icon name="rotate" size={11} /> Cambiar el enlace
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <Modal
          open
          onClose={() => setConfirming(false)}
          title={tr('club.cal.regen')}
          subtitle={tr('club.cal.regen.warn')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Dejarlo así
              </Button>
              <Button variant="danger" disabled={pending} onClick={rotate}>
                {pending ? 'Cambiando…' : tr('common.changeIt')}
              </Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-ink-700">
            El enlace anterior deja de actualizarse de inmediato, así que quien lo tuviera, con permiso o sin él, deja
            de ver los eventos del club. Los miembros necesitan el enlace nuevo para volver a suscribirse.
          </p>
          {error && <p className="mt-3 rounded-md bg-danger-bg p-3 text-xs text-danger">{error}</p>}
        </Modal>
      )}
    </div>
  )
}
