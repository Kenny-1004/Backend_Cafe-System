import type { Request, Response } from 'express'
import authService from '@/modules/auth/auth.service'
import authRepository from '@/modules/auth/auth.repository'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
  verifyAccessToken,
} from '@/modules/auth/auth.tokens'

const login = async (req: Request, res: Response) => {
  const session = await authService.login(req.body.username, req.body.password, req.get('user-agent') ?? null)
  setAuthCookies(res, session.accessToken, session.refreshToken, session.expiresAt)
  res.success({ staff: session.staff, sessionExpiresAt: session.expiresAt }, 'Signed in')
}

const refresh = async (req: Request, res: Response) => {
  try {
    const session = await authService.refresh(req.cookies?.[REFRESH_COOKIE])
    setAuthCookies(res, session.accessToken, session.refreshToken, session.expiresAt)
    res.success({ staff: session.staff, sessionExpiresAt: session.expiresAt }, 'Session refreshed')
  } catch (error) {
    clearAuthCookies(res)
    throw error
  }
}

// Works even with an expired access token: the refresh cookie identifies the session
const logout = async (req: Request, res: Response) => {
  const claims = req.cookies?.[ACCESS_COOKIE] ? await verifyAccessToken(req.cookies[ACCESS_COOKIE]) : null
  await authService.logout(claims?.sid, req.cookies?.[REFRESH_COOKIE])
  clearAuthCookies(res)
  res.success(null, 'Signed out')
}

// For page loads: who is signed in, without a 401 when nobody is. A valid access cookie
// answers directly; an expired one is renewed from the refresh cookie (one round trip);
// otherwise { staff: null }.
const session = async (req: Request, res: Response) => {
  const claims = req.cookies?.[ACCESS_COOKIE] ? await verifyAccessToken(req.cookies[ACCESS_COOKIE]) : null
  if (claims) {
    const active = await authRepository.findActiveSession(claims.sid, Number(claims.sub))
    if (active) return res.success({ staff: authService.publicStaff(active) }, 'Signed in')
  }

  const refreshToken = req.cookies?.[REFRESH_COOKIE]
  if (refreshToken) {
    try {
      const renewed = await authService.refresh(refreshToken)
      setAuthCookies(res, renewed.accessToken, renewed.refreshToken, renewed.expiresAt)
      return res.success({ staff: renewed.staff }, 'Session renewed')
    } catch {
      clearAuthCookies(res)
    }
  }
  return res.success({ staff: null }, 'Not signed in')
}

const me = (req: Request, res: Response) => {
  res.success({ staff: authService.publicStaff(req.staff!) }, 'Current staff member')
}

export default { login, refresh, logout, session, me }
