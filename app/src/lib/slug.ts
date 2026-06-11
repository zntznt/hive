import { randomBytes } from 'crypto'

// unguessable, URL-friendly, no lookalike characters (0/O, 1/l/I)
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'

export function randomSlug(length = 12) {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}
