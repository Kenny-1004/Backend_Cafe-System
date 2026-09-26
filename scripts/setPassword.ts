import { hash } from '@node-rs/argon2'
import { createClient } from './runSqlFiles'

// Usage: npm run staff:password -- <username> <new password>
const run = async () => {
  const [username, password] = process.argv.slice(2)
  if (!username || !password) throw new Error('Usage: npm run staff:password -- <username> <new password>')
  if (password.length < 8) throw new Error('The password must be at least 8 characters')

  const client = await createClient()
  try {
    const { rowCount } = await client.query('UPDATE employees SET password_hash = $2 WHERE username = $1', [
      username.toLowerCase(),
      await hash(password),
    ])
    if (rowCount === 0) throw new Error(`No employee with username "${username}"`)
    await client.query(
      `UPDATE staff_sessions SET revoked_at = now()
        WHERE revoked_at IS NULL AND employee_id = (SELECT id FROM employees WHERE username = $1)`,
      [username.toLowerCase()],
    )
    console.log(`Password updated for ${username}; existing sessions signed out`)
  } finally {
    await client.end()
  }
}

run().catch((error) => {
  console.error((error as Error).message)
  process.exit(1)
})
