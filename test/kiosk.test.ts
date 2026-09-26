import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import pool from '@/db/pool'
import { api, placeOrder, productId, signIn, kioskAgent } from './helpers'

afterAll(() => pool.end())

describe('kiosk menu', () => {
  it('lists every active product grouped by category with live availability', async () => {
    const res = await (await kioskAgent()).get('/api/v1/menu')
    expect(res.status).toBe(200)
    const categories = res.body.data as { name: string; products: { id: number; isAvailable: boolean; price: string }[] }[]
    const products = categories.flatMap((category) => category.products)
    const { rows } = await pool.query<{ id: number; available: boolean }>(
      'SELECT product_id AS id, is_available AS available FROM v_product_availability WHERE is_active',
    )
    const { rows: order } = await pool.query<{ name: string }>(
      `SELECT c.name FROM categories c WHERE EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.is_active)
        ORDER BY c.sort_order, c.name`,
    )
    expect(categories.map((category) => category.name)).toEqual(order.map((row) => row.name)) // kiosk tab order
    expect(products.length).toBe(rows.length)
    expect(products.length).toBeGreaterThanOrEqual(298)
    const expected = new Map(rows.map((row) => [row.id, row.available]))
    expect(products.every((product) => expected.get(product.id) === product.isAvailable)).toBe(true)
    expect(products[0].price).toMatch(/^\d+\.\d{2}$/)
  })
})

describe('placing an order', () => {
  it('snapshots database prices and returns a receipt with a public id', async () => {
    const latte = await productId('Iced Caffe Latte (Grande 16oz)') // 160.00
    const cake = await productId('Chocolate Cake Slice') // 145.00
    const res = await (await kioskAgent())
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .send({ serviceType: 'take_out', items: [{ productId: latte, quantity: 2, notes: '  less ice ' }, { productId: cake, quantity: 1 }] })

    expect(res.status).toBe(201)
    expect(res.headers.location).toBe(`/api/v1/orders/${res.body.data.publicId}`)
    expect(res.body.data).toMatchObject({ status: 'unpaid', serviceType: 'take_out', total: '465.00' })
    expect(res.body.data.publicId).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.data.id).toBeUndefined() // the kiosk never sees the internal id
    expect(res.body.data.items[0]).toMatchObject({ name: 'Iced Caffe Latte (Grande 16oz)', quantity: 2, unitPrice: '160.00', lineTotal: '320.00', notes: 'less ice' })
  })

  it('is idempotent: a retry with the same key returns the same order', async () => {
    const key = randomUUID()
    const water = await productId('Bottled Water')
    const body = { items: [{ productId: water, quantity: 1 }] }
    const first = await (await kioskAgent()).post('/api/v1/orders').set('Idempotency-Key', key).send(body)
    const { rows: before } = await pool.query('SELECT count(*)::int AS n FROM orders')
    const retry = await (await kioskAgent()).post('/api/v1/orders').set('Idempotency-Key', key).send(body)
    const { rows: after } = await pool.query('SELECT count(*)::int AS n FROM orders')

    expect(retry.status).toBe(201)
    expect(retry.body.data.publicId).toBe(first.body.data.publicId)
    expect(retry.body.data.orderNumber).toBe(first.body.data.orderNumber)
    expect(after[0].n).toBe(before[0].n)
  })

  it('never lets the client set prices or unknown fields', async () => {
    const water = await productId('Bottled Water')
    const res = await (await kioskAgent())
      .post('/api/v1/orders')
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ productId: water, quantity: 1, price: '0.01' }], total: '0.01' })
    expect(res.status).toBe(400)
    expect(res.body.error.details.map((detail: { field: string }) => detail.field)).toEqual(expect.arrayContaining(['items[0]', 'total']))
  })

  it.each([
    ['a missing Idempotency-Key', undefined, { items: [{ productId: 1, quantity: 1 }] }],
    ['an empty cart', randomUUID(), { items: [] }],
    ['quantity above 50', randomUUID(), { items: [{ productId: 1, quantity: 51 }] }],
    ['a bad service type', randomUUID(), { serviceType: 'delivery', items: [{ productId: 1, quantity: 1 }] }],
  ])('rejects %s', async (_label, key, body) => {
    const req = (await kioskAgent()).post('/api/v1/orders')
    if (key) req.set('Idempotency-Key', key)
    const res = await req.send(body)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('refuses unknown and inactive products', async () => {
    const unknown = await (await kioskAgent()).post('/api/v1/orders').set('Idempotency-Key', randomUUID()).send({ items: [{ productId: 999999, quantity: 1 }] })
    expect(unknown.status).toBe(409)
    expect(unknown.body.error.code).toBe('PRODUCT_UNAVAILABLE')

    const admin = await signIn('admin')
    const id = await productId('Canned Cola')
    await admin.patch(`/api/v1/admin/products/${id}`).send({ isActive: false }).expect(200)
    const inactive = await (await kioskAgent()).post('/api/v1/orders').set('Idempotency-Key', randomUUID()).send({ items: [{ productId: id, quantity: 1 }] })
    expect(inactive.status).toBe(409)
    const menu = await (await kioskAgent()).get('/api/v1/menu')
    expect(JSON.stringify(menu.body.data)).not.toContain('Canned Cola')
    await admin.patch(`/api/v1/admin/products/${id}`).send({ isActive: true }).expect(200)
  })

  it('gives unique daily order numbers under 20 simultaneous orders', async () => {
    const water = await productId('Bottled Water')
    const orders = await Promise.all(Array.from({ length: 20 }, () => placeOrder([{ productId: water, quantity: 1 }])))
    const numbers = orders.map((order) => order.orderNumber)
    expect(new Set(numbers).size).toBe(20)
  })
})

describe('reading an order', () => {
  it('returns the receipt by public id and 404s for unknown ids', async () => {
    const water = await productId('Bottled Water')
    const order = await placeOrder([{ productId: water, quantity: 3 }])
    const res = await (await kioskAgent()).get(`/api/v1/orders/${order.publicId}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ publicId: order.publicId, total: '90.00', status: 'unpaid' })

    expect((await (await kioskAgent()).get(`/api/v1/orders/${randomUUID()}`)).status).toBe(404)
    expect((await (await kioskAgent()).get('/api/v1/orders/123')).status).toBe(400)
  })
})
