import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Tests run against a throwaway database next to the one in .env: "<name>_test".
// Override with TEST_DATABASE_URL. The real database is never touched.
if (existsSync('.env')) process.loadEnvFile('.env')

function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL
  if (!process.env.DATABASE_URL) throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to run the tests')
  const url = new URL(process.env.DATABASE_URL)
  url.pathname = `${url.pathname.replace(/^\//, '').replace(/_test$/, '')}_test`
  return url.toString()
}

const TEST_DATABASE_URL = testDatabaseUrl()
process.env.TEST_DATABASE_URL = TEST_DATABASE_URL

// The app under test connects exactly like production: as a login role that is only a
// member of cafe_app (created by test/globalSetup.ts). Privileged test setup uses the admin URL.
const appUrl = new URL(TEST_DATABASE_URL)
appUrl.username = 'cafe_api_test'
appUrl.password = 'cafe-api-test-password'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setup.ts'],
    fileParallelism: false, // one shared test database
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: appUrl.toString(),
      TEST_ADMIN_DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test-secret-that-is-definitely-longer-than-32-chars',
      LOGIN_RATE_LIMIT: '5',
      ORDER_RATE_LIMIT: '10000',
    },
  },
})
