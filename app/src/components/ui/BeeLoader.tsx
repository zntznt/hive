// The one sanctioned motion flourish: a dotted bee-path that animates, with a
// "Zumbando..." wink. Keep it to loading states.
export function BeeLoader({ label = 'Zumbando…', width = 120 }: { label?: string; width?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="h-[3px] rounded-[3px]"
        style={{
          width,
          backgroundImage: 'radial-gradient(circle, var(--honey-500) 1.5px, transparent 1.8px)',
          backgroundSize: '11px 3px',
          backgroundRepeat: 'repeat-x',
          animation: 'hive-beepath 1.1s linear infinite',
        }}
      />
      <span className="font-body text-xs font-bold text-sage-600">{label}</span>
    </span>
  )
}
