const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function fmtMoney(cents: number) {
  return mxn.format(cents / 100)
}

// accepts "12.50", "12,50", "12" -> cents (or null when unparseable)
export function parseMoneyToCents(input: string): number | null {
  const n = parseFloat(input.trim().replace(',', '.'))
  if (!isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}
