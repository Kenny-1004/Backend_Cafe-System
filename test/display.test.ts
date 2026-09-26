import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pool from '@/db/pool'
import { api, orderIdOf, placeOrder, productId, signIn, type Agent } from './helpers'

let cashier: Agent
let barista: Agent

beforeAll(async () => {
  cashier = await signIn('cashier1')
  barista = await signIn('barista1')
})
afterAll(() => pool.end())

describe('public now-serving display', () => {
  it('needs no login and shows only order numbers and first names', async () => {
    const order = await placeOrder([{ productId: await productId('Bottled Water'), quantity: 1 }])
    const id = await orderIdOf(order.publicId)

    let screen = await api().get('/api/v1/display')
    expect(screen.status).toBe(200)
    expect(JSON.stringify(screen.body.data)).not.toContain(`"orderNumber":${order.orderNumber},`) // unpaid is not shown

    await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: 'Maria Clara Santos', cashTendered: '30' }).expect(200)
    screen = await api().get('/api/v1/display')
    const preparing = screen.body.data.preparing.find((row: { orderNumber: number }) => row.orderNumber === order.orderNumber)
    expect(preparing).toEqual({ orderNumber: order.orderNumber, name: 'Maria', since: expect.any(String) })

    await barista.post(`/api/v1/board/orders/${id}/serve`).expect(200)
    screen = await api().get('/api/v1/display')
    expect(screen.body.data.preparing.some((row: { orderNumber: number }) => row.orderNumber === order.orderNumber)).toBe(false)
    expect(screen.body.data.ready.some((row: { orderNumber: number }) => row.orderNumber === order.orderNumber)).toBe(true)

    // Nothing private leaks: no internal ids, items, prices or public ids
    const text = JSON.stringify(screen.body)
    for (const secret of ['"id"', 'publicId', 'items', 'total', 'Santos']) expect(text).not.toContain(secret)

    await barista.post('/api/v1/board/orders/complete').send({ orderIds: [id] }).expect(200)
    screen = await api().get('/api/v1/display')
    expect(screen.body.data.ready.some((row: { orderNumber: number }) => row.orderNumber === order.orderNumber)).toBe(false)
  })
})
