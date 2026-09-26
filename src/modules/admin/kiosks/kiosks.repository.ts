import pool from '@/db/pool'

export type KioskRow = {
  id: number
  name: string
  status: 'paired' | 'pairing' | 'unpaired'
  isActive: boolean
  pairingExpiresAt: Date | null
  pairedAt: Date | null
  lastSeenAt: Date | null
  createdAt: Date
  createdByName: string
}

const SELECT = `
  SELECT k.id, k.name,
         CASE WHEN k.token_hash IS NOT NULL THEN 'paired'
              WHEN k.pairing_expires_at > now() THEN 'pairing'
              ELSE 'unpaired' END AS status,
         k.is_active AS "isActive",
         CASE WHEN k.pairing_expires_at > now() THEN k.pairing_expires_at END AS "pairingExpiresAt",
         k.paired_at AS "pairedAt", k.last_seen_at AS "lastSeenAt", k.created_at AS "createdAt",
         e.full_name AS "createdByName"
    FROM kiosk_devices k
    JOIN employees e ON e.id = k.created_by`

const list = async () => (await pool.query<KioskRow>(`${SELECT} ORDER BY k.is_active DESC, k.name`)).rows

const findById = async (id: number) => (await pool.query<KioskRow>(`${SELECT} WHERE k.id = $1`, [id])).rows[0] ?? null

const create = async (name: string, codeHash: string, expiresAt: Date, employeeId: number) => {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO kiosk_devices (name, pairing_code_hash, pairing_expires_at, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [name, codeHash, expiresAt, employeeId],
  )
  return rows[0].id
}

// A new code un-pairs the current tablet (replaced or lost device); it must pair again
const issueCode = async (id: number, codeHash: string, expiresAt: Date) => {
  const { rowCount } = await pool.query(
    `UPDATE kiosk_devices
        SET pairing_code_hash = $2, pairing_expires_at = $3, token_hash = NULL, paired_at = NULL
      WHERE id = $1`,
    [id, codeHash, expiresAt],
  )
  return rowCount === 1
}

const update = async (id: number, fields: { name?: string; isActive?: boolean }) => {
  const { rowCount } = await pool.query(
    'UPDATE kiosk_devices SET name = coalesce($2, name), is_active = coalesce($3, is_active) WHERE id = $1',
    [id, fields.name ?? null, fields.isActive ?? null],
  )
  return rowCount === 1
}

export default { list, findById, create, issueCode, update }
