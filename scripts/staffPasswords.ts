import type { Client } from 'pg'
import { hash } from '@node-rs/argon2'

export const DEV_PASSWORD = process.env.DEV_STAFF_PASSWORD ?? 'cafe12345'

// Seed accounts are created with a placeholder hash. Outside production, give them a
// known development password so the panels can be signed into right after setup.
export async function setDevPasswords(client: Client) {
  const { rows } = await client.query<{ id: number; username: string }>(
    `SELECT id, username FROM employees WHERE password_hash NOT LIKE '$argon2%' ORDER BY id`,
  )
  if (rows.length === 0) return []
  const passwordHash = await hash(DEV_PASSWORD)
  await client.query(`UPDATE employees SET password_hash = $1 WHERE id = ANY($2::bigint[])`, [
    passwordHash,
    rows.map((row) => row.id),
  ])
  return rows.map((row) => row.username)
}
