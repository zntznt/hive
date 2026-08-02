import type { StringKey } from './lang'

// Keys, not sentences. This is a module-level const, and copy in one freezes
// whichever language rendered first on that server.
export const PAYMENT_METHOD_KEYS: Record<string, StringKey> = {
  bank_account: 'pay.bank_account',
  bank_code: 'pay.bank_code',
  card: 'pay.card',
  cash: 'pay.cash',
  other: 'pay.other',
}

export const PAYMENT_METHOD_VALUES = Object.keys(PAYMENT_METHOD_KEYS)
