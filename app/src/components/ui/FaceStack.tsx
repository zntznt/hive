import { UserAvatar, type AvatarUser } from './Avatar'

// Who, not how many.
//
// "2 miembros" is a fact nobody pictures. Four faces and a +8 is the same fact
// in a form the eye reads without counting, and it is the reason a club card
// stopped carrying a member count at all.
//
// `people` is who we can show; `total` is how many there are. They differ on
// purpose: a club's faces come from who has actually turned up to its events,
// while the count comes from the roster, so the overflow is computed from
// `total` and stays honest even when the two disagree.
//
// Never pair this with the count it replaces. "4 caras +8" next to
// "12 miembros" on one row is the bug this component exists to remove.

export function FaceStack({
  people,
  total,
  size = 20,
  max = 4,
  className = '',
}: {
  people: AvatarUser[]
  total?: number
  size?: number
  max?: number
  className?: string
}) {
  const shown = people.slice(0, max)
  // an empty list renders nothing rather than a bare "+5": a club with no
  // events has no faces, and that is a real state with its own copy
  if (shown.length === 0) return null
  const over = (typeof total === 'number' ? total : people.length) - shown.length
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <span className="flex items-center">
        {shown.map((p, i) => (
          <span
            key={`${p.display_name}-${i}`}
            // a hairline of the card colour between overlapping hexagons, so
            // the stack reads as separate people rather than one shape
            style={{ marginLeft: i ? -Math.round(size * 0.3) : 0, filter: 'drop-shadow(1px 0 0 var(--paper))' }}
          >
            <UserAvatar user={p} size={size} />
          </span>
        ))}
      </span>
      {over > 0 && (
        <span className="text-ink-500" style={{ fontSize: Math.max(11, size * 0.58) }}>
          +{over}
        </span>
      )}
    </span>
  )
}
