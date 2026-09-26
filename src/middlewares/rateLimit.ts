import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import env from '@/config/env'

const tooMany = (message: string) => () => {
  throw new AppError(StatusCodes.TOO_MANY_REQUESTS, message, 'RATE_LIMITED')
}

// Brute-force protection: failed attempts per minute per IP + username (design §5.8).
// Successful sign-ins do not count, so a cashier signing in and out is never locked out.
export const loginRateLimit = rateLimit({
  windowMs: 60_000,
  limit: env.LOGIN_RATE_LIMIT,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : ''
    return `${ipKeyGenerator(req.ip ?? '')}|${username}`
  },
  handler: tooMany('Too many sign-in attempts. Please wait a minute and try again.'),
})

// Kiosk order placement per paired device (design: ~10/min per device, with headroom)
export const placeOrderRateLimit = rateLimit({
  windowMs: 60_000,
  limit: env.ORDER_RATE_LIMIT,
  keyGenerator: (req) => (req.kiosk && !req.kiosk.preview ? `kiosk:${req.kiosk.id}` : ipKeyGenerator(req.ip ?? '')),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: tooMany('Too many orders from this kiosk. Please wait a moment.'),
})

// Pairing codes: failed attempts per minute per IP, so codes cannot be guessed
export const pairingRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: tooMany('Too many pairing attempts. Please wait a minute.'),
})
