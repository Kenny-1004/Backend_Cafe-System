import path from 'node:path'
import { Client } from 'pg'
import { readSqlFiles } from '../scripts/runSqlFiles'
import { setDevPasswords } from '../scripts/staffPasswords'

// Recreates the test database from the real migrations + seed before the run
export default async function setup() {
  const testUrl = new URL(process.env.TEST_DATABASE_URL!)
  const database = testUrl.pathname.slice(1)
  if (!database.endsWith('_test')) throw new Error(`Refusing to reset "${database}": test databases must end in _test`)

  const adminUrl = new URL(testUrl)
  adminUrl.pathname = '/postgres'
  const admin = new Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${database}"`)
  await admin.end()

  const client = new Client({ connectionString: testUrl.toString() })
  await client.connect()
  try {
    await client.query('CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    for (const dir of ['migrations', 'seeds']) {
      for (const file of readSqlFiles(path.join(__dirname, '..', 'db', dir))) {
        await client.query('BEGIN')
        await client.query(file.sql)
        await client.query('COMMIT')
      }
    }
    await setDevPasswords(client)
    // The API's login role: a plain member of cafe_app, nothing more
    const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'cafe_api_test'")
    if (exists.rowCount === 0) await client.query("CREATE ROLE cafe_api_test LOGIN PASSWORD 'cafe-api-test-password'")
    await client.query("ALTER ROLE cafe_api_test WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD 'cafe-api-test-password'")
    await client.query('GRANT cafe_app TO cafe_api_test')
  } finally {
    await client.end()
  }
}
