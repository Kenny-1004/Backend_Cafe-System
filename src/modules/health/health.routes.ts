import { Router, type Request, type Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import pool from '@/db/pool'
import { isListenerConnected } from '@/realtime/listener'
import { openStreamCount } from '@/realtime/sse'

const healthRoutes = Router()

// Liveness: the process is up
healthRoutes.get(['/health', '/healthz'], (_req: Request, res: Response) => {
  res.success({ status: 'ok' }, 'Service is healthy')
})

// Readiness: database reachable, realtime connection up, stock ledger consistent
healthRoutes.get('/readyz', async (_req: Request, res: Response) => {
  const checks = { database: false, realtime: isListenerConnected(), stockLedger: false }
  try {
    const drift = await pool.query<{ drift: number }>('SELECT count(*)::int AS drift FROM v_stock_drift')
    checks.database = true
    checks.stockLedger = drift.rows[0].drift === 0
  } catch {
    // database unreachable: reported below
  }
  const ready = Object.values(checks).every(Boolean)
  const body = { status: ready ? 'ready' : 'degraded', checks, openStreams: openStreamCount() }
  if (ready) res.success(body, 'Ready')
  else res.status(StatusCodes.SERVICE_UNAVAILABLE).json({ success: false, message: 'Not ready', data: body, error: { code: 'NOT_READY', details: null } })
})

export default healthRoutes
