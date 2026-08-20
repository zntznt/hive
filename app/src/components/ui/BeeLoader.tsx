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
// `width` is the kit's documented call (`<BeeLoader label="…" width={160}/>`)
// and was dropped along with the bee-path it used to size. The shape change is
// a taste call and stands; losing a prop the handover documents was not a
// decision anybody made, so it is back, capping the lockup rather than the
// path.
export function BeeLoader({ label, width }: { label?: string; width?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5" style={width ? { maxWidth: width } : undefined}>
      {/* The smallest size that still gets the full mark, and side by side
          with the silhouette it is also the lighter of the two: the cut-out
          field is what keeps a hexagon from reading as a dark blob beside a
          line of 12px text. */}
      <span aria-hidden="true" className="hive-pulse leading-none">
        <BrandMark size="sm" showWordmark={false} />
      </span>
      {label && <span className="min-w-0 truncate font-body text-xs font-bold text-sage-600">{label}</span>}
    </span>
  )
}
