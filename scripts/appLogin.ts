import { createClient } from './runSqlFiles'

// Creates (or updates the password of) the login user the API connects as.
// It is a member of cafe_app, so it gets exactly cafe_app's rights and nothing more.
// Usage: npm run db:app-login -- <username> "<password>"
const run = async () => {
  const [username, password] = process.argv.slice(2)
  if (!username || !/^[a-z_][a-z0-9_]{2,62}$/.test(username)) {
    throw new Error('Usage: npm run db:app-login -- <username> "<password>"  (username: lowercase letters, digits, _)')
  }
  if (!password || password.length < 12) throw new Error('Use a password of at least 12 characters')

  const client = await createClient()
  try {
    const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'cafe_app'")
    if (role.rowCount === 0) throw new Error('Role cafe_app does not exist yet. Run npm run db:migrate first.')

    const exists = (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [username])).rowCount === 1
    const name = client.escapeIdentifier(username)
    const secret = client.escapeLiteral(password)
    if (exists) {
      await client.query(`ALTER ROLE ${name} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${secret}`)
    } else {
      await client.query(`CREATE ROLE ${name} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${secret}`)
    }
    await client.query(`GRANT cafe_app TO ${name}`)

    const url = new URL(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL!)
    url.username = username
    url.password = '<password>'
    console.log(`${exists ? 'Updated' : 'Created'} login "${username}" (member of cafe_app).`)
    console.log(`Point the API at it in .env:\n  DATABASE_URL=${url.toString().replace('%3Cpassword%3E', '<password>')}`)
  } finally {
    await client.end()
  }
}

run().catch((error) => {
  console.error((error as Error).message)
  process.exit(1)
})
