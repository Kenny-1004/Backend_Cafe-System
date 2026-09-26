import { createClient } from './runSqlFiles'
import { DEV_PASSWORD, setDevPasswords } from './staffPasswords'

const run = async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to set development passwords in production')
  const client = await createClient()
  try {
    const usernames = await setDevPasswords(client)
    if (usernames.length === 0) console.log('Every account already has a real password; nothing changed')
    else console.log(`Development password "${DEV_PASSWORD}" set for: ${usernames.join(', ')}`)
  } finally {
    await client.end()
  }
}

run().catch((error) => {
  console.error((error as Error).message)
  process.exit(1)
})
