import type { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import authRepository from '@/modules/auth/auth.repository'
import { ACCESS_COOKIE, verifyAccessToken } from '@/modules/auth/auth.tokens'
import type { StaffPrincipal } from '@/types/auth'

// The signed-in staff member, or null. Verifies the access-token cookie, then loads the
// session and employee from the database: that one indexed query means a logout, a
// deactivated account or a role change takes effect on the very next request.
export async function resolveStaff(req: Request): Promise<StaffPrincipal | null> {
  const token = req.cookies?.[ACCESS_COOKIE]
  if (!token) return null
  const claims = await verifyAccessToken(token)
  if (!claims) return null
  const session = await authRepository.findActiveSession(claims.sid, Number(claims.sub))
  if (!session) return null
  return {
    id: session.id,
    username: session.username,
    fullName: session.fullName,
    role: session.role,
    sessionId: session.sessionId,
  }
}

const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  const staff = await resolveStaff(req)
  if (!staff) throw new AppError(StatusCodes.UNAUTHORIZED, 'Please sign in', 'UNAUTHENTICATED')
  req.staff = staff
  next()
}

export default authenticate
