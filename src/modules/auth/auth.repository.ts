import pool from '@/db/pool'
import type { EmployeeRole, StaffPrincipal } from '@/types/auth'

type EmployeeLoginRow = {
  id: number
  username: string
  fullName: string
  role: EmployeeRole
  isActive: boolean
  passwordHash: string
}

const findEmployeeByUsername = async (username: string) => {
  const { rows } = await pool.query<EmployeeLoginRow>(
    `SELECT id, username, full_name AS "fullName", role, is_active AS "isActive",
            password_hash AS "passwordHash"
       FROM employees
      WHERE username = $1`,
    [username],
  )
  return rows[0] ?? null
}

const createSession = async (employeeId: number, tokenHash: string, userAgent: string | null, expiresAt: Date) => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO staff_sessions (employee_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [employeeId, tokenHash, userAgent?.slice(0, 300) ?? null, expiresAt],
  )
  await pool.query('UPDATE employees SET last_login_at = now() WHERE id = $1', [employeeId])
  return rows[0].id
}

type SessionRow = StaffPrincipal & { expiresAt: Date }

// A usable session: not revoked, not expired, employee still active
const findActiveSession = async (sessionId: string, employeeId: number) => {
  const { rows } = await pool.query<SessionRow>(
    `SELECT e.id, e.username, e.full_name AS "fullName", e.role, s.id AS "sessionId",
            s.expires_at AS "expiresAt"
       FROM staff_sessions s
       JOIN employees e ON e.id = s.employee_id
      WHERE s.id = $1 AND s.employee_id = $2
        AND s.revoked_at IS NULL AND s.expires_at > now() AND e.is_active`,
    [sessionId, employeeId],
  )
  return rows[0] ?? null
}

// Rotation: the presented refresh token is swapped for a new one in a single UPDATE,
// so a token can be used once. A reused (stolen) token matches nothing.
const rotateRefreshToken = async (oldHash: string, newHash: string) => {
  const { rows } = await pool.query<SessionRow>(
    `UPDATE staff_sessions s
        SET token_hash = $2
       FROM employees e
      WHERE s.token_hash = $1 AND e.id = s.employee_id
        AND s.revoked_at IS NULL AND s.expires_at > now() AND e.is_active
      RETURNING e.id, e.username, e.full_name AS "fullName", e.role, s.id AS "sessionId",
                s.expires_at AS "expiresAt"`,
    [oldHash, newHash],
  )
  return rows[0] ?? null
}

const revokeSession = async (sessionId: string) => {
  await pool.query('UPDATE staff_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [sessionId])
}

const revokeSessionByTokenHash = async (tokenHash: string) => {
  await pool.query('UPDATE staff_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash])
}

export default {
  findEmployeeByUsername,
  createSession,
  findActiveSession,
  rotateRefreshToken,
  revokeSession,
  revokeSessionByTokenHash,
}
