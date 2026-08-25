import { Icon, type IconName } from './Icon'

export function PollOption({
  label,
  votes = 0,
  max = 1,
  selected = false,
  chosen = false,
  chosenLabel,
  showResults = true,
  multi = false,
}: {
  label: string
  votes?: number
  max?: number
  selected?: boolean
  chosen?: boolean
  // The word for the winning option, from the table. This component and
  // its parent are both server-rendered, and the parent already takes its
  // translator as a prop, so the copy comes down the same way rather than
  // sitting inline as the one literal in components/ui.
  chosenLabel?: string
  showResults?: boolean
  multi?: boolean
}) {
  // checkbox glyphs for multi-choice, radio glyphs for single (wireframe 8)
  const mark: IconName = multi
    ? selected
      ? 'square-check'
      : 'square'
    : selected
      ? 'circle-dot'
      : 'circle'
  return (
    <div>
      <div
        className={`relative flex min-h-11 w-full items-center justify-between gap-2 overflow-hidden rounded-md border-[1.5px] px-3 py-[9px] text-sm ${
          selected ? 'border-honey-500 bg-honey-50 text-honey-800' : 'border-line-card bg-paper text-ink-700'
        }`}
      >
        {/* The result is the row shading itself, not a hairline underneath it.
            A detached track made every option two shapes, and honey-400 is a
            colour the kit's poll never uses. */}
        {showResults && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 left-0 ${selected ? 'bg-honey-200' : 'bg-cream-sunk'}`}
            style={{ width: `${(votes / Math.max(max, 1)) * 100}%` }}
          />
        )}
        <span className="relative">
          <Icon name={mark} size={12} className="mr-1.5" />
          {label}
          {chosen && <span className="ml-2 rounded-[6px] bg-honey-100 px-[7px] py-0.5 text-[11px] font-bold text-honey-800">{chosenLabel}</span>}
        </span>
        {showResults && <span className="relative font-bold tabular-nums text-ink-500">{votes}</span>}
      </div>
    </div>
  )
}
