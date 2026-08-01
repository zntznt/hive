import { normalizePhone, formatPhone } from './phone'

// What the member typed, and therefore which channel this sign-in uses.
//
// One field takes either an address or a number, so the field has to say which
// one it thinks it got, while they are still looking at it. The number case is
// the one that matters: somebody types "55 1234 5678" and the app sends to
// +52 55 1234 5678, and without an echo the first time they see that country
// code is never. If we guessed the wrong country, the message goes nowhere and
// the screen said nothing about it.
//
// Parsing is normalizePhone's job, not a second copy of those rules living
// here. Everything below is about what to say.

export type Identity =
  | { kind: 'empty' }
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string; display: string }
  // has digits but not enough of them to be a number anywhere
  | { kind: 'short'; raw: string }
  // no @ and no digits: not an attempt at either
  | { kind: 'unclear'; raw: string }

export function parseIdentity(raw: string): Identity {
  const v = raw.trim()
  if (!v) return { kind: 'empty' }
  if (v.includes('@')) return { kind: 'email', value: v.toLowerCase() }
  if (!/\d/.test(v)) return { kind: 'unclear', raw: v }
  const phone = normalizePhone(v)
  return phone ? { kind: 'phone', value: phone, display: formatPhone(phone) } : { kind: 'short', raw: v }
}

// The line under the field. It changes as they type, and for a number it
// carries the normalized form so the country code is visible before they
// commit to it.
export function identityHelper(id: Identity): string {
  switch (id.kind) {
    case 'email':
      return 'Te mandamos un código de 6 dígitos a ese correo.'
    case 'phone':
      return `Te mandamos un código de 6 dígitos a ${id.display} por WhatsApp.`
    case 'short':
      return 'Un número recibe el código por WhatsApp. Los mexicanos no necesitan el +52.'
    default:
      return 'Con tu correo o tu WhatsApp. En los dos casos te llega un código de 6 dígitos.'
  }
}

// The button says where the code is going, because on a field that takes two
// kinds of thing the label is the clearest confirmation of which one it read.
export function identityAction(id: Identity): string {
  if (id.kind === 'email') return 'Mándame el código por correo'
  if (id.kind === 'phone' || id.kind === 'short') return 'Mándame el código por WhatsApp'
  return 'Continuar'
}
