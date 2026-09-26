import { createHash, randomBytes } from 'crypto'
import type { CookieOptions, Response } from 'express'
import { SignJWT, jwtVerify } from 'jose'
import env from '@/config/env'
import type { EmployeeRole } from '@/types/auth'

export const ACCESS_COOKIE = 'cafe_access'
export const REFRESH_COOKIE = 'cafe_refresh'

export const ACCESS_TTL_SECONDS = 15 * 60 // 15 minutes
export const SESSION_TTL_SECONDS = 8 * 60 * 60 // one shift: 8 hours

const secret = new TextEncoder().encode(env.JWT_SECRET)

export type AccessClaims = {
  sub: string // employee id
  sid: string // staff_sessions.id
  role: EmployeeRole
}

export const signAccessToken = (claims: AccessClaims) =>
  new SignJWT({ sid: claims.sid, role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret)

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null
    return { sub: payload.sub, sid: payload.sid, role: payload.role as EmployeeRole }
  } catch {
    return null // expired, tampered or malformed
  }
}

// Refresh tokens are random, opaque and stored only as a sha256 hash
export const newRefreshToken = () => randomBytes(32).toString('base64url')
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

const baseCookie: CookieOptions = {
  httpOnly: true, // never readable by page scripts
  sameSite: 'strict', // not sent on cross-site requests (CSRF)
  secure: env.COOKIE_SECURE,
}

// The refresh cookie is only sent to the auth endpoints
const REFRESH_PATH = '/api/v1/auth'

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string, sessionExpiresAt: Date) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...baseCookie, path: '/', maxAge: ACCESS_TTL_SECONDS * 1000 })
  res.cookie(REFRESH_COOKIE, refreshToken, { ...baseCookie, path: REFRESH_PATH, expires: sessionExpiresAt })
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie, path: '/' })
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie, path: REFRESH_PATH })
}
