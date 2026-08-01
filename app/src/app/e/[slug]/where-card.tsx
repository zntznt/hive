import { Icon, MapPinIcon } from '@/components/ui/Icon'
import { WhenPill } from '@/components/ui/WhenPill'

// Where this is, in one block.
//
// The event page used to answer "where" three times over: a charcoal banner
// with the address and a Mapa button, then an identity card printing the same
// address again, and then, on the day, it hid the map and the route link. So
// on the one day somebody actually has to get to a place, the address was
// printed twice and the map was deleted. That is backwards: the banner tells
// you where to go and the map tells you how far, and on the day you want both
// more than on any other day.
//
// One card, three states. On the day it goes charcoal and absorbs the banner,
// keeping the map directly underneath, in one honey-bordered container. With
// no place agreed there is no card at all, because a placeholder saying
// nothing has been decided is a second way of saying what the line says.
//
// No Mapa button anywhere. Where the map is embedded, the map is the way to
// the map, so a pill pointing at it is a third thing answering the same
// question.

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
  title,
  when,
  span,
  status,
  chosenStart,
  today,
  canEdit,
  editHref,
}: {
  location: string | null
  title: string
  // the full sentence under the address on the day: "Casa de Marta · hoy 20:00 a 23:00"
  when: string
  span: string
  status: string
  chosenStart: string | null
  today: boolean
  canEdit: boolean
  editHref: string
}) {
  // Nothing to show, so nothing is drawn. One muted line, and a way to fix it
  // for whoever can.
  if (!location) {
    return (
      <div className="mb-5 flex items-center justify-between gap-2.5 px-0.5">
        <span className="text-sm text-ink-300">Sin lugar todavía</span>
        {canEdit && (
          <a href={editHref} className="tap text-[12.5px] font-bold text-honey-700">
            Poner un lugar
          </a>
        )}
      </div>
    )
  }

  if (today) {
    return (
      <div className="mb-5 overflow-hidden rounded-lg border-[1.5px] border-honey-500 shadow-raised">
        <div className="flex items-start gap-3 bg-charcoal px-3.5 py-3">
          <span className="mt-0.5 flex-shrink-0">
            <Icon name="location-dot" size={15} className="text-honey-500" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold text-on-dark">{location}</span>
            <span className="text-xs text-on-dark-mute">{when}</span>
          </span>
        </div>
        {/* kept, deliberately: the address says where, this says how far */}
        <MapFrame location={location} title={title} />
      </div>
    )
  }

  return (
    <div className="mb-5 overflow-hidden rounded-lg border border-line-card bg-paper shadow-raised">
      <MapFrame location={location} title={title} />
      <div className="flex items-start justify-between gap-2.5 px-3.5 pb-3 pt-3">
        <span className="flex min-w-0 items-start gap-2">
          <MapPinIcon size={15} />
          <span className="min-w-0">
            <span className="block text-[15px] font-extrabold text-ink-900">{location}</span>
            {span && <span className="mt-0.5 block text-[12.5px] text-ink-500">{span}</span>}
          </span>
        </span>
        <WhenPill at={status === 'scheduling' ? null : chosenStart} status={status} className="flex-shrink-0" />
      </div>
    </div>
  )
}
