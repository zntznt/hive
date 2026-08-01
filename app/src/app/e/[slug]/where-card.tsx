import Link from 'next/link'
import { type ReactNode } from 'react'
import { Icon, MapPinIcon, type IconName } from '@/components/ui/Icon'
import { WhenPill } from '@/components/ui/WhenPill'

// Where this is, in one block.
//
// The event page used to answer "where" three times over: a charcoal banner
// with the address and a Mapa button, then an identity card printing the same
// address again, and then, on the day, it hid the map and the route link. So
// on the one day somebody actually has to get to a place, the address was
// printed twice and the map was deleted.
//
// One card, three states, and the two live states swap which line leads. That
// swap is the whole reason there are two. A week out you are deciding whether
// to go, so the place NAME leads and the street sits under it. At 19:50 you
// are trying to arrive, so the STREET ADDRESS leads and the place name drops
// below. Same card, same facts, different question.
//
// With no place agreed there is no card at all, because a placeholder saying
// nothing has been decided is a second way of saying what the line says.
//
// No Mapa button anywhere. Where the map is embedded, the map is the way to
// the map, so a pill pointing at it is a third thing answering one question.
//
// The map is the last thing in the card in both states. It is the one part
// nobody reads, they look at it, so it sits under the lines you read and the
// buttons you press rather than pushing them down the screen.

function MapFrame({ location, title }: { location: string; title: string }) {
  return (
    <iframe
      title={title}
      src={`https://www.google.com/maps?q=${encodeURIComponent(location)}&z=15&output=embed`}
      className="block h-[150px] w-full border-0"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  )
}

export function WhereCard({
  location,
  area,
  title,
  span,
  going,
  receipt,
  status,
  chosenStart,
  today,
  canEdit,
  editHref,
  calendar,
}: {
  location: string | null
  // the street line under the name: "Calle Colima 210, Roma Norte, CDMX"
  area: string | null
  title: string
  // "20:00 a 23:00", from fmtSpan. Never a bare start.
  span: string
  going: number
  // Who committed the club to this, and what happens next. "Marta fijó la hora
  // hace 2h · se avisó a todos" once there is a time; "Marta abrió la votación
  // hace 2h · cierra cuando elija horario" while there is not. A receipt, not
  // news, which is why it is grey and sits under the actions.
  receipt: { icon: IconName; text: string } | null
  status: string
  chosenStart: string | null
  today: boolean
  canEdit: boolean
  editHref: string
  // Add to calendar belongs inside this card: it is a thing you do about where
  // and when. It used to float as its own block further down the page.
  calendar?: ReactNode
}) {
  if (!location) {
    return (
      <div className="mb-5 flex items-center justify-between gap-2.5 px-0.5">
        <span className="text-sm text-ink-300">Sin lugar todavía</span>
        {canEdit && (
          <Link href={editHref} className="tap text-[12.5px] font-bold text-honey-700">
            Poner un lugar
          </Link>
        )}
      </div>
    )
  }

  // Everything under the head, identical in both live states: who can change
  // it, the receipt for who fixed the time, the calendar hand-off, and the way
  // out to directions.
  const body = (
    <>
      {canEdit && (
        <Link href={editHref} className="tap block px-3.5 pt-2.5 text-[13px] font-bold text-honey-700">
          Cambiar lugar
        </Link>
      )}
      {receipt && (
        <p className="flex items-start gap-2 px-3.5 pt-2.5 text-[12px] leading-snug text-ink-300">
          <span className="mt-0.5 flex-shrink-0">
            <Icon name={receipt.icon} size={11} />
          </span>
          <span className="min-w-0">{receipt.text}</span>
        </p>
      )}
      {calendar && <div className="px-3.5 pb-3 pt-2.5">{calendar}</div>}
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}`}
        target="_blank"
        rel="noreferrer"
        className="tap flex min-h-11 items-center justify-center gap-1.5 border-t border-line-divider text-sm font-bold text-honey-700"
      >
        Cómo llegar <Icon name="arrow-up-right-from-square" size={11} />
      </a>
      {/* Kept in both states, deliberately. The head says where to go and the
          map says how far, and the day of the event is when you want both
          most: hiding it then was the original defect. */}
      <MapFrame location={location} title={title} />
    </>
  )

  if (today) {
    return (
      <div className="mb-5 overflow-hidden rounded-lg border-[1.5px] border-honey-500 bg-paper shadow-raised">
        {/* The street leads: the only question left is how to get there. */}
        <div className="flex items-start gap-3 bg-charcoal px-3.5 py-3">
          <span className="mt-0.5 flex-shrink-0">
            <Icon name="location-dot" size={15} className="text-honey-500" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {/* With a separate street line the address leads and the place
                name drops below it. Without one there is only the place, so
                the second line carries the hours alone rather than printing
                the same address twice, which is the duplication this card
                exists to remove. */}
            <span className="text-[15px] font-bold text-on-dark">{area ?? location}</span>
            <span className="text-xs text-on-dark-mute">
              {area ? `${location}${span ? ` · hoy ${span}` : ''}` : span ? `hoy ${span}` : ''}
            </span>
          </span>
        </div>
        {body}
      </div>
    )
  }

  return (
    <div className="mb-5 overflow-hidden rounded-lg border border-line-card bg-paper shadow-raised">
      {/* The name leads: a week out the question is whether you want to be
          there on a Thursday, not how to get to a street. */}
      <div className="flex items-start justify-between gap-2.5 px-3.5 pt-3">
        <span className="flex min-w-0 items-start gap-2">
          <MapPinIcon size={15} />
          <span className="min-w-0">
            <span className="block text-[15px] font-extrabold text-ink-900">{location}</span>
            <span className="mt-0.5 block text-[12.5px] text-ink-500">
              {area ? `${area} · ` : ''}
              {going} van
            </span>
          </span>
        </span>
        <WhenPill at={status === 'scheduling' ? null : chosenStart} status={status} className="flex-shrink-0" />
      </div>
      {body}
    </div>
  )
}
