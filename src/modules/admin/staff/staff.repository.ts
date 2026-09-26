import type { PoolClient } from 'pg'
import pool from '@/db/pool'
import type { EmployeeRole } from '@/types/auth'

export type EmployeeRow = {
  id: number
  username: string
  fullName: string
  role: EmployeeRole
  isActive: boolean
  createdAt: Date
  lastLoginAt: Date | null
  activeSessions: number
}

const SELECT = `
  SELECT e.id, e.username, e.full_name AS "fullName", e.role, e.is_active AS "isActive",
         e.created_at AS "createdAt", e.last_login_at AS "lastLoginAt",
         (SELECT count(*) FROM staff_sessions s
           WHERE s.employee_id = e.id AND s.revoked_at IS NULL AND s.expires_at > now())::int AS "activeSessions"
    FROM employees e`

const list = async () => (await pool.query<EmployeeRow>(`${SELECT} ORDER BY e.is_active DESC, e.role, e.full_name`)).rows

const findById = async (id: number) => (await pool.query<EmployeeRow>(`${SELECT} WHERE e.id = $1`, [id])).rows[0] ?? null

const create = async (fields: { username: string; fullName: string; role: EmployeeRole; passwordHash: string }) => {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO employees (username, full_name, role, password_hash)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [fields.username, fields.fullName, fields.role, fields.passwordHash],
  )
  return rows[0].id
}

const update = async (
  client: PoolClient,
  id: number,
  fields: { fullName?: string; role?: EmployeeRole; isActive?: boolean; passwordHash?: string },
) => {
  const { rowCount } = await client.query(
    `UPDATE employees SET
        full_name     = coalesce($2, full_name),
        role          = coalesce($3::employee_role, role),
        is_active     = coalesce($4, is_active),
        password_hash = coalesce($5, password_hash)
      WHERE id = $1`,
    [id, fields.fullName ?? null, fields.role ?? null, fields.isActive ?? null, fields.passwordHash ?? null],
  )
  return rowCount === 1
}

// Signs the employee out everywhere (deactivation, password reset)
const revokeSessions = async (client: PoolClient, employeeId: number) => {
  await client.query(
    'UPDATE staff_sessions SET revoked_at = now() WHERE employee_id = $1 AND revoked_at IS NULL',
    [employeeId],
  )
}

export default { list, findById, create, update, revokeSessions }
