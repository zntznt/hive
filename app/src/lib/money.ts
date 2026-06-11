export function fmtEur(cents: number) {
  return (
    (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    ' €'
  )
}

// accepts "12,50", "12.50", "12" → cents (or null when unparseable)
export function parseEurToCents(input: string): number | null {
  const n = parseFloat(input.trim().replace(',', '.'))
  if (!isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}
