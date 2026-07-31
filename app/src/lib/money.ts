const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function fmtMoney(cents: number) {
  return mxn.format(cents / 100)
}

// Money as a person in Mexico actually types it, to integer cents.
//
// This used to be `parseFloat(input.replace(',', '.'))`, which replaces only
// the FIRST comma and then stops at the second separator. "1,234.50" became
// 123 cents. Thousands separators are ordinary here, so the most natural way
// to type twelve hundred pesos stored twelve.
//
// Accepts "12.50", "12,50", "1,234.50", "2.500,75", "1 234.50", "$1,234.50".
// Rejects anything else rather than guessing: a wrong amount that looks
// plausible is worse than a rejected one.
export function parseMoneyToCents(input: string): number | null {
  const raw = input.trim().replace(/[\s$]|\u00a0/g, '')
  if (!raw || !/^[0-9.,]+$/.test(raw)) return null

  // The last separator is the decimal one, but only if it splits off 1-2
  // digits. "12.345" is twelve thousand three hundred forty five, not 12.345.
  const lastDot = raw.lastIndexOf('.')
  const lastComma = raw.lastIndexOf(',')
  const cut = Math.max(lastDot, lastComma)
  const tail = cut === -1 ? '' : raw.slice(cut + 1)
  const decimal = cut !== -1 && tail.length > 0 && tail.length <= 2 && /^[0-9]+$/.test(tail)

  const wholeRaw = decimal ? raw.slice(0, cut) : raw
  // Grouping separators come in threes. Without this "1,2,3" would quietly
  // parse as 12.30, and a plausible wrong amount is worse than a rejected one.
  if (/[.,]/.test(wholeRaw) && !/^[0-9]{1,3}([.,][0-9]{3})*$/.test(wholeRaw)) return null
  if (!/^[0-9]*$/.test(wholeRaw.replace(/[.,]/g, ''))) return null
  const whole = wholeRaw.replace(/[.,]/g, '')
  if (whole && !/^[0-9]+$/.test(whole)) return null
  const frac = decimal ? tail.padEnd(2, '0') : '00'

  const cents = Number(whole || '0') * 100 + Number(frac)
  if (!Number.isSafeInteger(cents) || cents <= 0) return null
  // amount_cents is a Postgres int; anything past it is a typo, not an expense
  if (cents > 2_147_483_647) return null
  return cents
}
