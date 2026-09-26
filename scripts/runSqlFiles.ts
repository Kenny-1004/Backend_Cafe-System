import fs from 'fs'
import path from 'path'
import { Client } from 'pg'

export const readSqlFiles = (directory: string) =>
  fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({ name: file, sql: fs.readFileSync(path.join(directory, file), 'utf8') }))

// Schema changes and seeding need the database owner. The API itself connects through
// DATABASE_URL as a restricted cafe_app member, so admin scripts prefer MIGRATION_DATABASE_URL.
export const createClient = async () => {
  const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL
  if (!connectionString) throw new Error('Set MIGRATION_DATABASE_URL or DATABASE_URL (copy .env.example to .env)')
  const client = new Client({ connectionString })
  await client.connect()
  return client
}

// Runs one SQL file inside a transaction; nothing is applied if any statement fails.
export const runInTransaction = async (client: Client, name: string, sql: string) => {
  try {
    await client.query('BEGIN')
    await client.query(sql)
    return client
  } catch (error) {
    await client.query('ROLLBACK')
    throw new Error(`${name} failed: ${(error as Error).message}`)
  }
}
