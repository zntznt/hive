import { UserAvatar, type AvatarUser } from '@/components/ui/Avatar'

// Who is coming, by name, one chip each.
//
// This used to be a stack of overlapping faces with a comma-joined sentence
// under it, which is two summaries of the same list and neither of them a
// list. Six overlapping 30px hexagons hide three of the six people, and
// "Marta, Jorge, Lucía, Pablo" under it makes you match names to faces you
// cannot see.
//
// So: one chip per person, avatar and name together, and the guests they bring
// ride on the chip of whoever brought them. Nobody is hidden and nothing is
// counted twice.

export type Attendee = {
  key: string
  name: string
  user: AvatarUser
  // unpromoted guests this person brings, rendered as the +N on their chip
  plus: number
  mine: boolean
}

export function WhoIsComing({ people }: { people: Attendee[] }) {
  if (people.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((p) => (
        <span
          key={p.key}
          className={`inline-flex items-center gap-1.5 rounded-pill py-[3px] pl-[3px] pr-2.5 text-[12.5px] font-bold ${
            p.mine ? 'bg-honey-100 text-ink-900' : 'bg-cream-sunk text-ink-900'
          }`}
        >
          <UserAvatar user={p.user} size={22} />
          {p.mine ? 'Tú' : p.name}
          {p.plus > 0 && (
            <span className="rounded-pill bg-honey-500 px-1.5 text-[10.5px] font-extrabold text-charcoal">
              +{p.plus}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}
