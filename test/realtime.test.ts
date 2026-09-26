import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import app from '@/app'
import pool from '@/db/pool'
import { startListener, stopListener } from '@/realtime/listener'
import { closeAllStreams } from '@/realtime/sse'
import { runExpiry } from '@/jobs/expiryJob'
import { adminPool, endAdminPool, orderIdOf, placeOrder, productId, signIn } from './helpers'

let server: Server
let base: string
let kioskCookie: string // a real tablet's device cookie, as a browser would hold it

beforeAll(async () => {
  await startListener()
  server = app.listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const manager = await signIn('admin')
  const created = await manager.post('/api/v1/admin/kiosks').send({ name: 'Realtime test kiosk' })
  const paired = await fetch(`${base}/api/v1/kiosk/pair`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: created.body.data.pairingCode }),
  })
  kioskCookie = paired.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
})

afterAll(async () => {
  closeAllStreams()
  await new Promise((resolve) => server.close(resolve))
  await stopListener()
  await pool.end()
  await endAdminPool()
})

// Reads an SSE stream until an event matching `match` arrives
async function waitForEvent(url: string, init: RequestInit, match: (event: string, data: unknown) => boolean, act: () => Promise<void>) {
  const controller = new AbortController()
  const res = await fetch(url, { ...init, signal: controller.signal })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('text/event-stream')
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let acted = false
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) throw new Error('stream ended')
      buffer += decoder.decode(value, { stream: true })
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = /^event: (.+)$/m.exec(chunk)?.[1]
        const data = /^data: (.+)$/m.exec(chunk)?.[1]
        if (event === 'ready' && !acted) {
          acted = true
          await act()
        } else if (event && data && match(event, JSON.parse(data))) {
          return JSON.parse(data)
        }
      }
    }
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}

describe('realtime events', () => {
  it('tells the kiosk when its own order changes status (and nothing else)', async () => {
    const cashier = await signIn('cashier1')
    const order = await placeOrder([{ productId: await productId('Bottled Water'), quantity: 1 }])
    const id = await orderIdOf(order.publicId)

    const event = await waitForEvent(
      `${base}/api/v1/orders/${order.publicId}/events`,
      { headers: { Cookie: kioskCookie } },
      (name, data) => name === 'order.status' && (data as { status: string }).status === 'pending',
      async () => {
        await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: 'Stream', cashTendered: '30' }).expect(200)
      },
    )
    expect(event).toEqual({ orderId: id, publicId: order.publicId, orderNumber: order.orderNumber, status: 'pending' })
    expect(JSON.stringify(event)).not.toContain('Stream') // no customer names in events
  })

  it('streams board events only to signed-in staff', async () => {
    const anonymous = await fetch(`${base}/api/v1/board/events`)
    expect(anonymous.status).toBe(401)

    const login = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'barista1', password: 'cafe12345' }),
    })
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
    const cashier = await signIn('cashier2')
    const order = await placeOrder([{ productId: await productId('Bottled Water'), quantity: 1 }])
    const id = await orderIdOf(order.publicId)

    const event = await waitForEvent(
      `${base}/api/v1/board/events`,
      { headers: { Cookie: cookie } },
      (name, data) => name === 'order.status' && (data as { orderId: number }).orderId === id,
      async () => {
        await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: 'Board', cashTendered: '30' }).expect(200)
      },
    )
    expect(event).toMatchObject({ orderId: id, status: 'pending' })
  })

  it('announces stock changes to kiosks so sold-out items update', async () => {
    const admin = await signIn('admin')
    const { rows } = await pool.query<{ id: number }>("SELECT id FROM ingredients WHERE name = 'Ice'")
    const event = await waitForEvent(
      `${base}/api/v1/menu/events`,
      { headers: { Cookie: kioskCookie } },
      (name) => name === 'menu.changed',
      async () => {
        await admin.post(`/api/v1/admin/ingredients/${rows[0].id}/movements`).send({ type: 'restock', quantity: '100' }).expect(201)
      },
    )
    expect(event).toEqual({ ingredientId: rows[0].id })
  })
})

describe('24-hour expiry job', () => {
  it('expires stale open orders, records the system as the actor, and leaves fresh ones alone', async () => {
    const stale = await placeOrder([{ productId: await productId('Bottled Water'), quantity: 1 }])
    const fresh = await placeOrder([{ productId: await productId('Bottled Water'), quantity: 1 }])
    const staleId = await orderIdOf(stale.publicId)
    const freshId = await orderIdOf(fresh.publicId)
    await adminPool().query(`UPDATE orders SET created_at = now() - interval '25 hours' WHERE id = $1`, [staleId])

    const expired = await runExpiry()
    expect(expired).toBeGreaterThanOrEqual(1)

    const { rows } = await pool.query<{ id: number; status: string }>('SELECT id, status FROM orders WHERE id = ANY($1)', [[staleId, freshId]])
    expect(Object.fromEntries(rows.map((row) => [row.id, row.status]))).toEqual({ [staleId]: 'expired', [freshId]: 'unpaid' })
    const { rows: history } = await pool.query(
      `SELECT changed_by FROM order_status_history WHERE order_id = $1 AND to_status = 'expired'`,
      [staleId],
    )
    expect(history[0].changed_by).toBeNull()
  })
})
