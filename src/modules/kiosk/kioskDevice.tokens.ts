import { randomInt } from 'crypto'
import type { CookieOptions, Response } from 'express'
import env from '@/config/env'

export const KIOSK_COOKIE = 'cafe_kiosk'
const KIOSK_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000 // a tablet stays paired until deactivated

export const PAIRING_TTL_MINUTES = 15

// Codes are read aloud / typed on a tablet: no 0/O, 1/I/L look-alikes
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function newPairingCode() {
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `${chars.slice(0, 4)}-${chars.slice(4)}`
}

// "abcd efgh", "ABCD-EFGH" and "abcdefgh" are the same code
export const normalizePairingCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')

const cookie: CookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: env.COOKIE_SECURE,
  path: '/',
  maxAge: KIOSK_COOKIE_MAX_AGE,
}

export const setKioskCookie = (res: Response, token: string) => res.cookie(KIOSK_COOKIE, token, cookie)
export const clearKioskCookie = (res: Response) => res.clearCookie(KIOSK_COOKIE, { ...cookie, maxAge: undefined })
