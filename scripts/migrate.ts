import path from 'path'
import { createClient, readSqlFiles, runInTransaction } from './runSqlFiles'

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations')
const BASELINE = '001_baseline.sql'

const migrate = async () => {
  const client = await createClient()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`)

    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations')
    const applied = new Set(rows.map((row) => row.name))
    const pending = readSqlFiles(MIGRATIONS_DIR).filter((file) => !applied.has(file.name))

    if (pending.length === 0) {
      console.log('Database is up to date')
      return
    }

    for (const file of pending) {
      // A database created before migrations were tracked already has the baseline
      // schema: record it as applied instead of running it (it would fail on CREATE TYPE).
      if (file.name === BASELINE) {
        const existing = await client.query<{ exists: boolean }>(
          "SELECT to_regclass('public.orders') IS NOT NULL AS exists",
        )
        if (existing.rows[0].exists) {
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file.name])
          console.log(`Baseline ${file.name} already present, marked as applied`)
          continue
        }
      }

      await runInTransaction(client, file.name, file.sql)
      try {
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file.name])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
      console.log(`Applied ${file.name}`)
    }
  } finally {
    await client.end()
  }
}

migrate().catch((error) => {
  console.error((error as Error).message)
  process.exit(1)
})
