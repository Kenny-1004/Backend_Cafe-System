import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pool from '@/db/pool'
import { orderIdOf, placeOrder, productId, signIn, type Agent, kioskAgent, adminPool, endAdminPool } from './helpers'

let cashier: Agent
let barista: Agent

beforeAll(async () => {
  cashier = await signIn('cashier2')
  barista = await signIn('barista1')
})
afterAll(async () => {
  await pool.end()
  await endAdminPool()
})

async function paidOrder(name: string) {
  const order = await placeOrder([
    { productId: await productId('Iced Matcha Latte (Grande 16oz)'), quantity: 2, notes: 'less ice' },
    { productId: await productId('Chocolate Cake Slice'), quantity: 1 },
  ])
  const id = await orderIdOf(order.publicId)
  await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: name, cashTendered: '1000' }).expect(200)
  return { id, ...order }
}

describe('orders board', () => {
  it('shows paid orders in Pending with the name and items for the call-out', async () => {
    const order = await paidOrder('Kent')
    const res = await barista.get('/api/v1/board')
    expect(res.status).toBe(200)
    const card = res.body.data.pending.find((row: { id: number }) => row.id === order.id)
    expect(card).toMatchObject({ customerName: 'Kent', status: 'pending', serviceType: 'take_out' })
    expect(card.items).toEqual([
      { name: 'Iced Matcha Latte (Grande 16oz)', quantity: 2, notes: 'less ice', prepared: true },
      { name: 'Chocolate Cake Slice', quantity: 1, notes: null, prepared: false },
    ])
  })

  it('does not show unpaid orders', async () => {
    const order = await placeOrder([{ productId: await productId('Bottled Water'), quantity: 1 }])
    const id = await orderIdOf(order.publicId)
    const res = await barista.get('/api/v1/board')
    const all = [...res.body.data.pending, ...res.body.data.serving]
    expect(all.some((row: { id: number }) => row.id === id)).toBe(false)

    const serve = await barista.post(`/api/v1/board/orders/${id}/serve`)
    expect(serve.status).toBe(409)
    expect(serve.body.error.code).toBe('INVALID_STATE')
  })

  it('moves a card to Serving on Done, and clears it once picked up', async () => {
    const order = await paidOrder('Pat')
    const done = await barista.post(`/api/v1/board/orders/${order.id}/serve`)
    expect(done.status).toBe(200)

    const board = await barista.get('/api/v1/board')
    expect(board.body.data.serving.some((row: { id: number }) => row.id === order.id)).toBe(true)
    expect(board.body.data.pending.some((row: { id: number }) => row.id === order.id)).toBe(false)

    const twice = await barista.post(`/api/v1/board/orders/${order.id}/serve`)
    expect(twice.status).toBe(409)

    const clear = await barista.post('/api/v1/board/orders/complete').send({ orderIds: [order.id, order.id] })
    expect(clear.status).toBe(200)
    expect(clear.body.data.cleared).toBe(1)
    const again = await barista.post('/api/v1/board/orders/complete').send({ orderIds: [order.id] })
    expect(again.body.data.cleared).toBe(0) // a double tap is harmless

    const receipt = await (await kioskAgent()).get(`/api/v1/orders/${order.publicId}`)
    expect(receipt.body.data.status).toBe('completed')

    const { rows } = await pool.query(
      `SELECT h.from_status, h.to_status, e.username FROM order_status_history h
         LEFT JOIN employees e ON e.id = h.changed_by WHERE h.order_id = $1 ORDER BY h.id`,
      [order.id],
    )
    expect(rows.map((row) => `${row.from_status ?? '-'}->${row.to_status} by ${row.username ?? 'kiosk'}`)).toEqual([
      '-->unpaid by kiosk',
      'unpaid->pending by cashier2',
      'pending->serving by barista1',
      'serving->completed by barista1',
    ])
  })

  it('validates the complete request', async () => {
    expect((await barista.post('/api/v1/board/orders/complete').send({ orderIds: [] })).status).toBe(400)
    expect((await barista.post('/api/v1/board/orders/complete').send({})).status).toBe(400)
  })

  it('rejects illegal status jumps even through direct SQL', async () => {
    const order = await paidOrder('Lee')
    await expect(adminPool().query(`UPDATE orders SET status = 'completed' WHERE id = $1`, [order.id])).rejects.toMatchObject({ code: 'CF002' })
  })
})
