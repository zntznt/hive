import { Icon, type IconName } from './Icon'

export function PollOption({
  label,
  votes = 0,
  max = 1,
  selected = false,
  chosen = false,
  showResults = true,
  multi = false,
}: {
  label: string
  votes?: number
  max?: number
  selected?: boolean
  chosen?: boolean
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
        className={`flex w-full items-center justify-between gap-2 rounded-md border-[1.5px] px-3 py-[9px] text-sm ${
          selected ? 'border-honey-500 bg-honey-50 text-honey-800' : 'border-line-card bg-paper text-ink-700'
        }`}
      >
        <span>
          <Icon name={mark} size={12} className="mr-1.5" />
          {label}
          {chosen && <span className="ml-2 rounded-[6px] bg-honey-100 px-[7px] py-0.5 text-[11px] font-bold text-honey-800">elegida</span>}
        </span>
        {showResults && <span className="font-bold text-ink-500">{votes}</span>}
      </div>
      {showResults && (
        <div className="mt-1 h-1 rounded-[3px] bg-cream-sunk">
          <div className="h-1 rounded-[3px] bg-honey-400" style={{ width: `${(votes / Math.max(max, 1)) * 100}%` }} />
        </div>
      )}
    </div>
  )
}
