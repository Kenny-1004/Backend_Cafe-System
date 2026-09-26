import app from '@/app'
import env from '@/config/env'
import pool from '@/db/pool'
import { startListener, stopListener } from '@/realtime/listener'
import { closeAllStreams } from '@/realtime/sse'
import { startExpiryJob, stopExpiryJob } from '@/jobs/expiryJob'

const start = async () => {
  await pool.query('SELECT 1') // fail fast if the database is unreachable
  await startListener()
  if (env.EXPIRY_JOB_ENABLED) startExpiryJob()

  const server = app.listen(env.PORT, () => {
    console.log(`Campus Café API running on http://localhost:${env.PORT} (${env.NODE_ENV})`)
  })

  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`${signal} received, shutting down`)
    stopExpiryJob()
    closeAllStreams() // SSE streams would otherwise keep server.close() waiting forever
    server.close(async () => {
      await stopListener()
      await pool.end()
      process.exit(0)
    })
    server.closeIdleConnections()
    setTimeout(() => process.exit(1), 10_000).unref() // hard stop if something hangs
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

start().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
