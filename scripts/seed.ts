import path from 'path'
import { createClient, readSqlFiles, runInTransaction } from './runSqlFiles'
import { DEV_PASSWORD, setDevPasswords } from './staffPasswords'

const SEEDS_DIR = path.join(__dirname, '..', 'db', 'seeds')

const seed = async () => {
  const client = await createClient()
  try {
    const { rows } = await client.query<{ count: string }>('SELECT count(*) FROM products')
    if (Number(rows[0].count) > 0) {
      console.log('Seed skipped: the database already has products')
    } else {
      for (const file of readSqlFiles(SEEDS_DIR)) {
        await runInTransaction(client, file.name, file.sql)
        await client.query('COMMIT')
        console.log(`Seeded ${file.name}`)
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      const usernames = await setDevPasswords(client)
      if (usernames.length > 0) console.log(`Development password "${DEV_PASSWORD}" set for: ${usernames.join(', ')}`)
    }
  } finally {
    await client.end()
  }
}

seed().catch((error) => {
  console.error((error as Error).message)
  process.exit(1)
})
