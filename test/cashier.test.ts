import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pool from '@/db/pool'
import { ingredientId, orderIdOf, placeOrder, productId, signIn, stockOf, type Agent } from './helpers'

let cashier: Agent
let admin: Agent

beforeAll(async () => {
  cashier = await signIn('cashier1')
  admin = await signIn('admin')
})
afterAll(() => pool.end())

describe('looking up an order', () => {
  it('finds today’s order by the number the customer says, with lines and total', async () => {
    const order = await placeOrder([{ productId: await productId('Iced Caffe Latte (Grande 16oz)'), quantity: 2 }])
    const res = await cashier.get(`/api/v1/cashier/orders/by-number/${order.orderNumber}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ orderNumber: order.orderNumber, status: 'unpaid', total: '320.00', itemCount: 2 })
    expect(res.body.data.items).toHaveLength(1)

    const list = await cashier.get('/api/v1/cashier/orders?status=unpaid')
    expect(list.body.data.map((row: { orderNumber: number }) => row.orderNumber)).toContain(order.orderNumber)

    const missing = await cashier.get('/api/v1/cashier/orders/by-number/99999')
    expect(missing.status).toBe(404)
  })
})

describe('taking cash payment', () => {
  it('rejects too little cash and a missing name, then accepts payment and returns the change', async () => {
    const order = await placeOrder([
      { productId: await productId('Iced Caffe Latte (Grande 16oz)'), quantity: 2 },
      { productId: await productId('Chocolate Cake Slice'), quantity: 1 },
    ])
    const id = await orderIdOf(order.publicId)

    const short = await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: 'Kent', cashTendered: '400' })
    expect(short.status).toBe(422)
    expect(short.body.error.code).toBe('INSUFFICIENT_CASH')

    const noName = await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: '   ', cashTendered: '500' })
    expect(noName.status).toBe(400)

    const longName = await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: 'x'.repeat(61), cashTendered: '500' })
    expect(longName.status).toBe(400)

    const badCash = await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: 'Kent', cashTendered: '5.005' })
    expect(badCash.status).toBe(400)

    const milkBefore = await stockOf('Fresh milk')
    const espressoBefore = await stockOf('Espresso beans')

    const paid = await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: ' Kent ', cashTendered: 500 })
    expect(paid.status).toBe(200)
    expect(paid.body.data).toMatchObject({ status: 'pending', customerName: 'Kent', total: '465.00', cashTendered: '500.00', change: '35.00' })

    // Recipe for Iced Caffe Latte (Grande): 18 g espresso, 220 ml milk; the cake has no recipe
    expect(await stockOf('Fresh milk')).toBe(milkBefore - 440)
    expect(await stockOf('Espresso beans')).toBe(espressoBefore - 36)

    const again = await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: 'Kent', cashTendered: '500' })
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('INVALID_STATE')

    const cancelPaid = await cashier.post(`/api/v1/cashier/orders/${id}/cancel`)
    expect(cancelPaid.status).toBe(409)
  })

  it('records who took the payment in the audit trail', async () => {
    const order = await placeOrder([{ productId: await productId('Bottled Water'), quantity: 1 }])
    const id = await orderIdOf(order.publicId)
    await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: 'Pat', cashTendered: '30' }).expect(200)
    const { rows } = await pool.query(
      `SELECT h.to_status, e.username FROM order_status_history h LEFT JOIN employees e ON e.id = h.changed_by
        WHERE h.order_id = $1 ORDER BY h.id`,
      [id],
    )
    expect(rows).toEqual([
      { to_status: 'unpaid', username: null },
      { to_status: 'pending', username: 'cashier1' },
    ])
    const { rows: payment } = await pool.query('SELECT change_given::text AS change FROM payments WHERE order_id = $1', [id])
    expect(payment[0].change).toBe('0.00')
  })

  it('cancels an unpaid order, which can then not be paid', async () => {
    const order = await placeOrder([{ productId: await productId('Bottled Water'), quantity: 1 }])
    const id = await orderIdOf(order.publicId)
    const cancelled = await cashier.post(`/api/v1/cashier/orders/${id}/cancel`)
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.data.status).toBe('cancelled')
    const pay = await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: 'Pat', cashTendered: '100' })
    expect(pay.status).toBe(409)
    expect((await cashier.post('/api/v1/cashier/orders/999999/cancel')).status).toBe(404)
  })

  it('names the ingredient that ran out between kiosk and counter, and keeps the order unpaid', async () => {
    const matcha = await ingredientId('Matcha powder')
    const order = await placeOrder([{ productId: await productId('Iced Matcha Latte (Venti 24oz)'), quantity: 2 }]) // 2 × 7.5 g
    const id = await orderIdOf(order.publicId)

    const stock = await stockOf('Matcha powder')
    await admin.post(`/api/v1/admin/ingredients/${matcha}/movements`).send({ type: 'waste', quantity: String(stock - 10), note: 'test spill' }).expect(201)

    const res = await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: 'Sam', cashTendered: '1000' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('OUT_OF_STOCK')
    expect(res.body.message).toContain('Matcha powder (need 15.000 g, have 10.000)')
    const { rows } = await pool.query('SELECT status FROM orders WHERE id = $1', [id])
    expect(rows[0].status).toBe('unpaid')
    expect(await stockOf('Matcha powder')).toBe(10) // nothing was deducted

    await admin.post(`/api/v1/admin/ingredients/${matcha}/movements`).send({ type: 'restock', quantity: String(stock - 10) }).expect(201)
  })

  it('lets exactly two of three simultaneous payments take the last two servings', async () => {
    // An isolated ingredient + product so the race is exact
    const ingredient = await admin.post('/api/v1/admin/ingredients').send({ name: 'Race syrup', unit: 'ml', reorderLevel: '0', openingStock: '8' })
    expect(ingredient.status).toBe(201)
    const categories = await admin.get('/api/v1/admin/categories')
    const product = await admin.post('/api/v1/admin/products').send({
      categoryId: categories.body.data[0].id, name: 'Race Drink', productType: 'prepared', price: '50',
    })
    await admin.put(`/api/v1/admin/products/${product.body.data.id}/recipe`).send({ lines: [{ ingredientId: ingredient.body.data.id, quantity: '4' }] }).expect(200)

    const orders = await Promise.all([1, 2, 3].map(() => placeOrder([{ productId: product.body.data.id, quantity: 1 }])))
    const ids = await Promise.all(orders.map((order) => orderIdOf(order.publicId)))
    const cashier2 = await signIn('cashier2')
    const results = await Promise.all(
      ids.map((id, index) =>
        (index % 2 ? cashier : cashier2).post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: `Racer ${index}`, cashTendered: '50' }),
      ),
    )
    const statuses = results.map((res) => res.status).sort()
    expect(statuses).toEqual([200, 200, 409])
    expect(results.find((res) => res.status === 409)!.body.message).toContain('Race syrup (need 4.000 ml, have 0.000)')
    expect(await stockOf('Race syrup')).toBe(0)

    const drift = await pool.query('SELECT count(*)::int AS n FROM v_stock_drift')
    expect(drift.rows[0].n).toBe(0)
  })

  it('summarises today for the cashier', async () => {
    const res = await cashier.get('/api/v1/cashier/summary')
    expect(res.status).toBe(200)
    expect(res.body.data.myPaidCount).toBeGreaterThanOrEqual(2)
    expect(res.body.data.paidTotal).toMatch(/^\d+\.\d{2}$/)
  })
})
