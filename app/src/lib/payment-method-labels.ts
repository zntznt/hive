export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_account: 'Cuenta bancaria',
  bank_code: 'CLABE',
  card: 'Tarjeta',
  cash: 'Efectivo',
  other: 'Otro',
}

export const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))
