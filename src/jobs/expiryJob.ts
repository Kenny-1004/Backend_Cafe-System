import pool from '@/db/pool'

// Leader election across API instances: only the instance holding this advisory lock
// runs the job each round (design §6.5).
const EXPIRE_JOB_LOCK = 42_001
const EVERY_10_MIN = 10 * 60_000

let timer: NodeJS.Timeout | undefined
let startupTimer: NodeJS.Timeout | undefined

export async function runExpiry(): Promise<number | null> {
  const client = await pool.connect()
  let locked = false
  try {
    const lock = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [EXPIRE_JOB_LOCK])
    locked = lock.rows[0].ok
    if (!locked) return null // another instance is the leader this round

    const result = await client.query<{ expired: number }>('SELECT expire_stale_orders() AS expired')
    const expired = result.rows[0].expired
    if (expired > 0) console.log(`expire_stale_orders: ${expired} order(s) expired`)
    return expired
  } catch (error) {
    console.error('expire_stale_orders failed:', error)
    return null
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [EXPIRE_JOB_LOCK]).catch(() => undefined)
    client.release()
  }
}

export function startExpiryJob() {
  startupTimer = setTimeout(() => void runExpiry(), 5_000) // catch up after a restart
  timer = setInterval(() => void runExpiry(), EVERY_10_MIN)
}

export function stopExpiryJob() {
  clearTimeout(startupTimer)
  clearInterval(timer)
}
