import { BrandMark } from './BrandMark'

// The app's one sanctioned motion flourish, and it means "the thing you just
// did is running", never "this screen is on its way" (that is Skeleton).
//
// It used to be a dotted bee-path scrolling sideways. It is the mark now, and
// it does not rotate: a spinning hexagon reads as somebody else's loading
// spinner, and the mark is a container, not a wheel. A quiet opacity pulse is
// enough to say something is still happening without competing with the copy
// next to it. `prefers-reduced-motion` stills it, and the label carries the
// meaning on its own.
//
// The label is optional and has no default. It used to default to a hardcoded
// "Zumbando…", which meant an English phone got one Spanish word in the middle
// of an English screen.
export function BeeLoader({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      {/* The smallest size that still gets the full mark, and side by side
          with the silhouette it is also the lighter of the two: the cut-out
          field is what keeps a hexagon from reading as a dark blob beside a
          line of 12px text. */}
      <span aria-hidden="true" className="hive-pulse leading-none">
        <BrandMark size="sm" showWordmark={false} />
      </span>
      {label && <span className="font-body text-xs font-bold text-sage-600">{label}</span>}
    </span>
  )
}
