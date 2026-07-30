'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'

export type OutboxRow = {
  id: string
  created_at: string
  channel: string
  template: string
  status: string
  sent_at: string | null
  error: string | null
  provider_ref: string | null
  recipient: string
}

// The counts above answer "is anything broken". This answers "did Gabo get
// it", which is the question an admin actually has, and which until now could
// only be answered by querying the database by hand.
const TONE: Record<string, 'active' | 'pending' | 'neutral' | 'danger'> = {
  sent: 'active',
  pending: 'pending',
  queued: 'pending',
  logged: 'neutral',
  failed: 'danger',
}

const LABEL: Record<string, string> = {
  sent: 'enviado',
  pending: 'esperando confirmación',
  queued: 'en cola',
  logged: 'registrado',
  failed: 'falló',
}

function stamp(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Mexico_City',
  }).format(new Date(iso))
}

export default function OutboxLog({ rows }: { rows: OutboxRow[] }) {
  const [open, setOpen] = useState(false)

  if (!rows.length) {
    return <p className="mt-2 text-xs text-ink-300">Todavía no sale ningún mensaje.</p>
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="tap rounded-md border-[1.5px] border-honey-500 px-2.5 py-1 text-xs font-bold text-honey-700"
      >
        {open ? 'Ocultar' : `Ver los últimos ${rows.length}`}
      </button>

      {open && (
        <ul className="mt-2.5 divide-y divide-line-divider overflow-hidden rounded-lg border border-line-card bg-paper">
          {rows.map((r) => (
            <li key={r.id} className="px-3 py-2.5 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Icon name={r.channel === 'whatsapp' ? 'link' : 'envelope'} size={11} />
                  <span className="truncate font-bold text-ink-900">{r.recipient}</span>
                </span>
                <Badge tone={TONE[r.status] ?? 'neutral'}>{LABEL[r.status] ?? r.status}</Badge>
              </div>
              <div className="mt-0.5 text-ink-500">
                {r.template} · {stamp(r.created_at)}
                {r.sent_at ? ` · salió ${stamp(r.sent_at)}` : ''}
              </div>
              {/* the provider's id, so one message can be traced to one
                  broadcast without going through the database */}
              {r.provider_ref && <div className="mt-0.5 break-all text-[11px] text-ink-300">{r.provider_ref}</div>}
              {r.error && <div className="mt-1 rounded-md bg-danger-bg p-2 text-[11.5px] text-danger">{r.error}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
