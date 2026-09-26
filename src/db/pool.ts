import { Pool, types, type PoolClient } from 'pg'
import env from '@/config/env'

// bigint (ids, counts) as JS numbers: ids stay far below 2^53, and the API sends numbers.
types.setTypeParser(types.builtins.INT8, (value) => Number(value))
// date columns (business_date) as 'YYYY-MM-DD' strings, never shifted by the server time zone.
types.setTypeParser(types.builtins.DATE, (value) => value)
// numeric stays a string ("415.00") so money never passes through floating point.

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
})

// An idle client can lose its connection (database restart, network drop). Without a
// listener, the pool's 'error' event would crash the process; the pool replaces the client.
pool.on('error', (error) => {
  console.error('Idle database client error:', error.message)
})

// Runs `work` inside BEGIN/COMMIT and rolls back on any error.
// If even ROLLBACK fails the connection is broken, so it is destroyed instead of reused.
export const withTransaction = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect()
  let broken: Error | undefined
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError: Error) => {
      broken = rollbackError
    })
    throw error
  } finally {
    client.release(broken)
  }
}

export default pool
