import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import authRepository from '@/modules/auth/auth.repository'
import { dummyPasswordHash, verifyPassword } from '@/modules/auth/auth.password'
import {
  SESSION_TTL_SECONDS,
  hashToken,
  newRefreshToken,
  signAccessToken,
} from '@/modules/auth/auth.tokens'
import type { StaffPrincipal } from '@/types/auth'

export type IssuedSession = {
  staff: Omit<StaffPrincipal, 'sessionId'>
  accessToken: string
  refreshToken: string
  expiresAt: Date
}

// One generic message for every login failure, so it never reveals which part was wrong
const invalidCredentials = () =>
  new AppError(StatusCodes.UNAUTHORIZED, 'Invalid username or password', 'INVALID_CREDENTIALS')

const publicStaff = ({ id, username, fullName, role }: StaffPrincipal) => ({ id, username, fullName, role })

const login = async (username: string, password: string, userAgent: string | null): Promise<IssuedSession> => {
  const employee = await authRepository.findEmployeeByUsername(username.trim().toLowerCase())
  const passwordOk = await verifyPassword(employee?.passwordHash ?? (await dummyPasswordHash()), password)
  if (!employee || !passwordOk || !employee.isActive) throw invalidCredentials()

  const refreshToken = newRefreshToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
  const sessionId = await authRepository.createSession(employee.id, hashToken(refreshToken), userAgent, expiresAt)
  const accessToken = await signAccessToken({ sub: String(employee.id), sid: sessionId, role: employee.role })

  return {
    staff: { id: employee.id, username: employee.username, fullName: employee.fullName, role: employee.role },
    accessToken,
    refreshToken,
    expiresAt,
  }
}

const refresh = async (refreshToken: string | undefined): Promise<IssuedSession> => {
  const sessionExpired = new AppError(StatusCodes.UNAUTHORIZED, 'Your session has ended. Please sign in again.', 'SESSION_EXPIRED')
  if (!refreshToken) throw sessionExpired

  const nextToken = newRefreshToken()
  const session = await authRepository.rotateRefreshToken(hashToken(refreshToken), hashToken(nextToken))
  if (!session) throw sessionExpired

  const accessToken = await signAccessToken({ sub: String(session.id), sid: session.sessionId, role: session.role })
  return { staff: publicStaff(session), accessToken, refreshToken: nextToken, expiresAt: session.expiresAt }
}

const logout = async (sessionId: string | undefined, refreshToken: string | undefined) => {
  if (sessionId) await authRepository.revokeSession(sessionId)
  else if (refreshToken) await authRepository.revokeSessionByTokenHash(hashToken(refreshToken))
}

export default { login, refresh, logout, publicStaff }
