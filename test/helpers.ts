import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Pool } from 'pg'
import request from 'supertest'
import { afterAll } from 'vitest'
import app from '@/app'
import pool from '@/db/pool'

// One long-lived HTTP server per test file. Given a bare app, supertest would start and stop
// a throwaway server for every request, and pooled sockets to those short-lived ports cause
// sporadic ECONNRESET / "socket hang up". A listening server is reused and never closed mid-test.
let server: Server | undefined
export const testServer = () => (server ??= app.listen(0))
afterAll(async () => {
  if (server) await new Promise((resolve) => server!.close(resolve))
  server = undefined
})

export const PASSWORD = 'cafe12345'

export type Agent = ReturnType<typeof request.agent>

// A supertest agent keeps cookies between requests, like a browser
export async function signIn(username: string, password = PASSWORD): Promise<Agent> {
  const agent = request.agent(testServer())
  const res = await agent.post('/api/v1/auth/login').send({ username, password })
  if (res.status !== 200) throw new Error(`Sign-in as ${username} failed: ${res.status} ${JSON.stringify(res.body)}`)
  return agent
}

export const api = () => request(testServer())

// Superuser connection for test setup the API itself is not allowed to do
// (back-dating an order, proving triggers reject direct writes). Created on first use.
let admin: Pool | undefined
export const adminPool = () => (admin ??= new Pool({ connectionString: process.env.TEST_ADMIN_DATABASE_URL }))
export const endAdminPool = async () => {
  await admin?.end()
  admin = undefined
}

// Registers a kiosk as the manager and pairs a fresh "tablet" with its one-time code
export async function pairKiosk(manager?: Agent) {
  const boss = manager ?? (await signIn('admin'))
  const created = await boss.post('/api/v1/admin/kiosks').send({ name: `Test kiosk ${randomUUID().slice(0, 8)}` })
  if (created.status !== 201) throw new Error(`Kiosk registration failed: ${JSON.stringify(created.body)}`)
  const tablet = request.agent(testServer())
  const paired = await tablet.post('/api/v1/kiosk/pair').send({ code: created.body.data.pairingCode })
  if (paired.status !== 200) throw new Error(`Pairing failed: ${JSON.stringify(paired.body)}`)
  return { tablet, kiosk: created.body.data.kiosk as { id: number; name: string }, code: created.body.data.pairingCode as string }
}

// One paired kiosk per test file
let kioskPromise: Promise<Agent> | undefined
export const kioskAgent = () => (kioskPromise ??= pairKiosk().then(({ tablet }) => tablet))

export async function productId(name: string) {
  const { rows } = await pool.query<{ id: number }>('SELECT id FROM products WHERE name = $1', [name])
  if (!rows[0]) throw new Error(`No product named ${name}`)
  return rows[0].id
}

export async function ingredientId(name: string) {
  const { rows } = await pool.query<{ id: number }>('SELECT id FROM ingredients WHERE name = $1', [name])
  if (!rows[0]) throw new Error(`No ingredient named ${name}`)
  return rows[0].id
}

export async function stockOf(name: string) {
  const { rows } = await pool.query<{ stock: string }>('SELECT stock_qty::text AS stock FROM ingredients WHERE name = $1', [name])
  return Number(rows[0].stock)
}

// Places a kiosk order and returns the API body's data
export async function placeOrder(items: { productId: number; quantity: number; notes?: string }[], serviceType = 'take_out') {
  const res = await (await kioskAgent())
    .post('/api/v1/orders')
    .set('Idempotency-Key', randomUUID())
    .send({ serviceType, items })
  if (res.status !== 201) throw new Error(`Order failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.data as { publicId: string; orderNumber: number; total: string; status: string }
}

export async function orderIdOf(publicId: string) {
  const { rows } = await pool.query<{ id: number }>('SELECT id FROM orders WHERE public_id = $1', [publicId])
  return rows[0].id
}
