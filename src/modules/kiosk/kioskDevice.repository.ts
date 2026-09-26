import pool from '@/db/pool'

export type KioskDevice = { id: number; name: string }

// An active, paired tablet by the sha256 of its device token
const findByTokenHash = async (tokenHash: string) => {
  const { rows } = await pool.query<KioskDevice>(
    'SELECT id, name FROM kiosk_devices WHERE token_hash = $1 AND is_active',
    [tokenHash],
  )
  return rows[0] ?? null
}

// last_seen_at at most once a minute, so busy kiosks do not write on every request
const touch = async (id: number) => {
  await pool.query(
    `UPDATE kiosk_devices SET last_seen_at = now()
      WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '1 minute')`,
    [id],
  )
}

// Redeems a one-time code: stores the new device token and closes the code in one UPDATE,
// so a code can pair exactly one tablet.
const pair = async (codeHash: string, tokenHash: string) => {
  const { rows } = await pool.query<KioskDevice>(
    `UPDATE kiosk_devices
        SET token_hash = $2, pairing_code_hash = NULL, pairing_expires_at = NULL,
            paired_at = now(), last_seen_at = now()
      WHERE pairing_code_hash = $1 AND pairing_expires_at > now() AND is_active
      RETURNING id, name`,
    [codeHash, tokenHash],
  )
  return rows[0] ?? null
}

export default { findByTokenHash, touch, pair }
