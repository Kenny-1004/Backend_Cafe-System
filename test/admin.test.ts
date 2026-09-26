import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pool from '@/db/pool'
import { api, ingredientId, orderIdOf, placeOrder, productId, signIn, stockOf, type Agent, kioskAgent, adminPool, endAdminPool } from './helpers'

let admin: Agent

beforeAll(async () => {
  admin = await signIn('admin')
})
afterAll(async () => {
  await pool.end()
  await endAdminPool()
})

describe('catalog', () => {
  it('creates, renames and reorders categories; rejects duplicates', async () => {
    const created = await admin.post('/api/v1/admin/categories').send({ name: 'Seasonal' })
    expect(created.status).toBe(201)
    expect(created.body.data).toMatchObject({ name: 'Seasonal', productCount: 0 })
    expect(created.body.data.sortOrder).toBeGreaterThan(13)

    const renamed = await admin.patch(`/api/v1/admin/categories/${created.body.data.id}`).send({ name: 'Seasonal Specials', sortOrder: 0 })
    expect(renamed.body.data).toMatchObject({ name: 'Seasonal Specials', sortOrder: 0 })

    const dup = await admin.post('/api/v1/admin/categories').send({ name: 'Hot Coffee' })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('CONFLICT')
  })

  it('creates a product with a recipe; availability follows its ingredient stock', async () => {
    const categories = await admin.get('/api/v1/admin/categories')
    const categoryId = categories.body.data.find((category: { name: string }) => category.name === 'Hot Coffee').id
    const product = await admin.post('/api/v1/admin/products').send({
      categoryId, name: 'Honey Latte (Grande 16oz)', description: 'Latte with honey.', productType: 'prepared', price: '175.50',
    })
    expect(product.status).toBe(201)
    expect(product.body.data).toMatchObject({ price: '175.50', isActive: true, recipeLines: 0, isAvailable: true })

    const honey = await admin.post('/api/v1/admin/ingredients').send({ name: 'Test honey', unit: 'ml', reorderLevel: '10', openingStock: '25' })
    const recipe = await admin.put(`/api/v1/admin/products/${product.body.data.id}/recipe`).send({
      lines: [{ ingredientId: honey.body.data.id, quantity: '20' }, { ingredientId: await ingredientId('Fresh milk'), quantity: 250 }],
    })
    expect(recipe.status).toBe(200)
    expect(recipe.body.data.recipe).toHaveLength(2)
    expect(recipe.body.data.isAvailable).toBe(true)

    // Waste honey down to 15 ml (< 20 per serving): the kiosk shows it sold out
    await admin.post(`/api/v1/admin/ingredients/${honey.body.data.id}/movements`).send({ type: 'waste', quantity: '10' }).expect(201)
    const detail = await admin.get(`/api/v1/admin/products/${product.body.data.id}`)
    expect(detail.body.data.isAvailable).toBe(false)
    const menu = await (await kioskAgent()).get('/api/v1/menu')
    const onMenu = menu.body.data.flatMap((category: { products: { id: number; isAvailable: boolean }[] }) => category.products)
      .find((item: { id: number }) => item.id === product.body.data.id)
    expect(onMenu.isAvailable).toBe(false)

    const dupLines = await admin.put(`/api/v1/admin/products/${product.body.data.id}/recipe`).send({
      lines: [{ ingredientId: honey.body.data.id, quantity: '1' }, { ingredientId: honey.body.data.id, quantity: '2' }],
    })
    expect(dupLines.status).toBe(400)
  })

  it('changes a price without touching orders already placed (price snapshot)', async () => {
    const id = await productId('Banana Bread')
    const order = await placeOrder([{ productId: id, quantity: 1 }])
    const updated = await admin.patch(`/api/v1/admin/products/${id}`).send({ price: '99.00', description: null })
    expect(updated.body.data).toMatchObject({ price: '99.00', description: null })
    const receipt = await (await kioskAgent()).get(`/api/v1/orders/${order.publicId}`)
    expect(receipt.body.data.items[0].unitPrice).toBe('95.00')
    expect(receipt.body.data.total).toBe('95.00')
  })

  it('filters products and validates input', async () => {
    const coffee = await admin.get('/api/v1/admin/products?search=latte&status=active')
    expect(coffee.body.data.length).toBeGreaterThan(10)
    expect(coffee.body.data.every((product: { name: string }) => /latte/i.test(product.name))).toBe(true)

    const bad = await admin.post('/api/v1/admin/products').send({ categoryId: 1, name: 'X', productType: 'magic', price: '-1' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.details.map((detail: { field: string }) => detail.field)).toEqual(expect.arrayContaining(['productType', 'price']))
    expect((await admin.patch('/api/v1/admin/products/999999').send({ price: '1' })).status).toBe(404)
  })
})

describe('inventory', () => {
  it('restocks, wastes and adjusts through the ledger, with history', async () => {
    const sugar = await ingredientId('Sugar syrup')
    const start = await stockOf('Sugar syrup')

    const restock = await admin.post(`/api/v1/admin/ingredients/${sugar}/movements`).send({ type: 'restock', quantity: '500' })
    expect(restock.status).toBe(201)
    expect(Number(restock.body.data.stockQty)).toBe(start + 500)

    await admin.post(`/api/v1/admin/ingredients/${sugar}/movements`).send({ type: 'waste', quantity: '100', note: 'spilled' }).expect(201)

    const noNote = await admin.post(`/api/v1/admin/ingredients/${sugar}/movements`).send({ type: 'adjustment', quantity: '-50' })
    expect(noNote.status).toBe(400)
    await admin.post(`/api/v1/admin/ingredients/${sugar}/movements`).send({ type: 'adjustment', quantity: '-50', note: 'count correction' }).expect(201)
    expect(await stockOf('Sugar syrup')).toBe(start + 350)

    const tooMuch = await admin.post(`/api/v1/admin/ingredients/${sugar}/movements`).send({ type: 'waste', quantity: '999999' })
    expect(tooMuch.status).toBe(422)
    expect(tooMuch.body.message).toMatch(/below zero/)

    const history = await admin.get(`/api/v1/admin/ingredients/${sugar}/movements?limit=2`)
    expect(history.body.data.items).toHaveLength(2)
    expect(history.body.data.items[0]).toMatchObject({ movementType: 'adjustment', quantityDelta: '-50.000', note: 'count correction', employeeName: 'Café Manager' })
    expect(history.body.data.nextCursor).not.toBeNull()
    const next = await admin.get(`/api/v1/admin/ingredients/${sugar}/movements?limit=2&cursor=${history.body.data.nextCursor}`)
    expect(next.body.data.items[0].movementType).toBe('restock')
  })

  it('never lets stock_qty be edited directly', async () => {
    const sugar = await ingredientId('Sugar syrup')
    const res = await admin.patch(`/api/v1/admin/ingredients/${sugar}`).send({ stockQty: '1' })
    expect(res.status).toBe(400)
    await expect(adminPool().query('DELETE FROM stock_movements WHERE id = 1')).rejects.toMatchObject({ code: 'CF007' })
  })

  it('lists ingredients at or below their reorder level', async () => {
    await admin.post('/api/v1/admin/ingredients').send({ name: 'Nearly out', unit: 'g', reorderLevel: '100', openingStock: '40' }).expect(201)
    await admin.post('/api/v1/admin/ingredients').send({ name: 'Plenty left', unit: 'g', reorderLevel: '100', openingStock: '900' }).expect(201)
    const res = await admin.get('/api/v1/admin/stock/low')
    expect(res.status).toBe(200)
    const names = res.body.data.map((row: { name: string }) => row.name)
    expect(names).toContain('Nearly out')
    expect(names).not.toContain('Plenty left')
    const filtered = await admin.get('/api/v1/admin/ingredients?status=low')
    expect(filtered.body.data.every((row: { isLow: boolean }) => row.isLow)).toBe(true)
  })
})

describe('suppliers and deliveries', () => {
  it('manages a supplier and its price list', async () => {
    const created = await admin.post('/api/v1/admin/suppliers').send({ name: 'Mactan Milk Farm', contactPerson: 'Liza', email: 'liza@mactanmilk.test' })
    expect(created.status).toBe(201)
    const id = created.body.data.id

    const prices = await admin.put(`/api/v1/admin/suppliers/${id}/ingredients`).send({
      items: [{ ingredientId: await ingredientId('Fresh milk'), unitCost: '0.08' }, { ingredientId: await ingredientId('Oat milk'), unitCost: 0.19 }],
    })
    expect(prices.status).toBe(200)
    expect(prices.body.data.priceList).toHaveLength(2)

    const edited = await admin.patch(`/api/v1/admin/suppliers/${id}`).send({ phone: '0917 555 0000', email: null })
    expect(edited.body.data).toMatchObject({ phone: '0917 555 0000', email: null, contactPerson: 'Liza' })

    expect((await admin.post('/api/v1/admin/suppliers').send({ name: 'Bad', email: 'not-an-email' })).status).toBe(400)
  })

  it('creates a delivery, receives actual quantities into stock, and blocks double receiving', async () => {
    const suppliers = await admin.get('/api/v1/admin/suppliers')
    const roasters = suppliers.body.data.find((row: { name: string }) => row.name === 'Cebu Coffee Roasters')
    const matcha = await ingredientId('Matcha powder')
    const beans = await ingredientId('Espresso beans')
    const matchaBefore = await stockOf('Matcha powder')
    const beansBefore = await stockOf('Espresso beans')

    const created = await admin.post('/api/v1/admin/deliveries').send({
      supplierId: roasters.id, expectedAt: '2026-10-01', notes: 'weekly order',
      items: [{ ingredientId: matcha, quantity: '1000', unitCost: '3.50' }, { ingredientId: beans, quantity: 2000, unitCost: '1.20' }],
    })
    expect(created.status).toBe(201)
    expect(created.body.data).toMatchObject({ status: 'ordered', itemCount: 2, totalCost: '5900.00', expectedAt: '2026-10-01' })

    const received = await admin.post(`/api/v1/admin/deliveries/${created.body.data.id}/receive`).send({
      received: [{ ingredientId: matcha, quantityReceived: '900' }], // beans not listed: arrived in full
    })
    expect(received.status).toBe(200)
    expect(received.body.data.status).toBe('received')
    expect(received.body.data.receivedByName).toBe('Café Manager')
    expect(await stockOf('Matcha powder')).toBe(matchaBefore + 900)
    expect(await stockOf('Espresso beans')).toBe(beansBefore + 2000)

    const again = await admin.post(`/api/v1/admin/deliveries/${created.body.data.id}/receive`).send({})
    expect(again.status).toBe(409)
    expect((await admin.post(`/api/v1/admin/deliveries/${created.body.data.id}/cancel`)).status).toBe(409)
  })

  it('cancels a delivery that never arrived and rejects bad items', async () => {
    const suppliers = await admin.get('/api/v1/admin/suppliers')
    const supplierId = suppliers.body.data[0].id
    const milk = await ingredientId('Fresh milk')
    const created = await admin.post('/api/v1/admin/deliveries').send({ supplierId, items: [{ ingredientId: milk, quantity: '100', unitCost: '0.1' }] })
    const cancelled = await admin.post(`/api/v1/admin/deliveries/${created.body.data.id}/cancel`)
    expect(cancelled.body.data.status).toBe('cancelled')

    const dup = await admin.post('/api/v1/admin/deliveries').send({
      supplierId, items: [{ ingredientId: milk, quantity: '1', unitCost: '1' }, { ingredientId: milk, quantity: '2', unitCost: '1' }],
    })
    expect(dup.status).toBe(400)
    const wrongItem = await admin.post(`/api/v1/admin/deliveries/${created.body.data.id}/receive`).send({ received: [{ ingredientId: 999999, quantityReceived: '1' }] })
    expect(wrongItem.status).toBe(409) // cancelled deliveries cannot be received

    const list = await admin.get('/api/v1/admin/deliveries?status=cancelled')
    expect(list.body.data.items.some((row: { id: number }) => row.id === created.body.data.id)).toBe(true)
  })
})

describe('staff accounts', () => {
  it('creates an employee who can sign in; deactivating signs them out everywhere', async () => {
    const created = await admin.post('/api/v1/admin/employees').send({ username: 'Maria.S', fullName: 'Maria Santos', role: 'cashier', password: 'counter-2026' })
    expect(created.status).toBe(201)
    expect(created.body.data).toMatchObject({ username: 'maria.s', role: 'cashier', isActive: true })

    const maria = await signIn('maria.s', 'counter-2026')
    expect((await maria.get('/api/v1/cashier/orders')).status).toBe(200)

    await admin.patch(`/api/v1/admin/employees/${created.body.data.id}`).send({ isActive: false }).expect(200)
    expect((await maria.get('/api/v1/cashier/orders')).status).toBe(401)
    const retry = await api().post('/api/v1/auth/login').send({ username: 'maria.s', password: 'counter-2026' })
    expect(retry.status).toBe(401)
  })

  it('applies a role change on the next request and protects the admin’s own account', async () => {
    const created = await admin.post('/api/v1/admin/employees').send({ username: 'jun', fullName: 'Jun Reyes', role: 'kitchen', password: 'barista-2026' })
    const jun = await signIn('jun', 'barista-2026')
    expect((await jun.get('/api/v1/cashier/orders')).status).toBe(403)
    await admin.patch(`/api/v1/admin/employees/${created.body.data.id}`).send({ role: 'cashier' }).expect(200)
    expect((await jun.get('/api/v1/cashier/orders')).status).toBe(200)

    const me = await admin.get('/api/v1/auth/me')
    const self = await admin.patch(`/api/v1/admin/employees/${me.body.data.staff.id}`).send({ isActive: false })
    expect(self.status).toBe(409)

    expect((await admin.post('/api/v1/admin/employees').send({ username: 'jun', fullName: 'Dup', role: 'kitchen', password: 'whatever-123' })).status).toBe(409)
    expect((await admin.post('/api/v1/admin/employees').send({ username: 'x', fullName: 'Short', role: 'kitchen', password: 'short' })).status).toBe(400)
  })

  it('resets a password: the old one stops working', async () => {
    const created = await admin.post('/api/v1/admin/employees').send({ username: 'ana', fullName: 'Ana Cruz', role: 'kitchen', password: 'first-pass-1' })
    await admin.patch(`/api/v1/admin/employees/${created.body.data.id}`).send({ password: 'second-pass-2' }).expect(200)
    expect((await api().post('/api/v1/auth/login').send({ username: 'ana', password: 'first-pass-1' })).status).toBe(401)
    expect((await api().post('/api/v1/auth/login').send({ username: 'ana', password: 'second-pass-2' })).status).toBe(200)
  })
})

describe('order history and reports', () => {
  it('shows an order’s full audit trail and payment', async () => {
    const cashier = await signIn('cashier1')
    const order = await placeOrder([{ productId: await productId('Butter Croissant'), quantity: 2 }])
    const id = await orderIdOf(order.publicId)
    await cashier.post(`/api/v1/cashier/orders/${id}/payment`).send({ customerName: 'Audit', cashTendered: '200' }).expect(200)

    const detail = await admin.get(`/api/v1/admin/orders/${id}`)
    expect(detail.body.data).toMatchObject({ customerName: 'Audit', status: 'pending', total: '190.00' })
    expect(detail.body.data.payment).toMatchObject({ cashTendered: '200.00', changeGiven: '10.00', receivedByName: 'Cashier One' })
    expect(detail.body.data.history.map((row: { toStatus: string }) => row.toStatus)).toEqual(['unpaid', 'pending'])

    const search = await admin.get(`/api/v1/admin/orders?search=${order.orderNumber}`)
    expect(search.body.data.items.some((row: { id: number }) => row.id === id)).toBe(true)
    const byName = await admin.get('/api/v1/admin/orders?search=audit&status=pending')
    expect(byName.body.data.items[0].id).toBe(id)
  })

  it('pages through history with a stable cursor', async () => {
    const water = await productId('Bottled Water')
    for (let i = 0; i < 11; i++) await placeOrder([{ productId: water, quantity: 1 }])
    const first = await admin.get('/api/v1/admin/orders?limit=5')
    const second = await admin.get(`/api/v1/admin/orders?limit=5&cursor=${first.body.data.nextCursor}`)
    const ids = [...first.body.data.items, ...second.body.data.items].map((row: { id: number }) => row.id)
    expect(new Set(ids).size).toBe(10)
    expect(ids).toEqual([...ids].sort((a, b) => b - a))
  })

  it('reports daily sales from paid orders only, matching the payments table', async () => {
    const report = await admin.get('/api/v1/admin/reports/daily-sales')
    expect(report.status).toBe(200)
    expect(report.body.data.days).toHaveLength(7)
    const today = report.body.data.days[6]
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n, coalesce(sum(p.amount_due),0)::numeric(12,2)::text AS total
         FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.business_date = cafe_today()`,
    )
    expect(today).toMatchObject({ ordersPaid: rows[0].n, grossSales: rows[0].total })

    const best = await admin.get('/api/v1/admin/reports/best-sellers?limit=3')
    expect(best.body.data.products.length).toBeGreaterThan(0)
    const summary = await admin.get('/api/v1/admin/reports/summary')
    expect(summary.body.data.ordersPaid).toBeGreaterThan(0)

    expect((await admin.get('/api/v1/admin/reports/daily-sales?from=2026-12-01&to=2026-01-01')).status).toBe(400)
    expect((await admin.get('/api/v1/admin/reports/daily-sales?from=2020-01-01&to=2026-01-01')).status).toBe(400)
  })

  it('builds the dashboard', async () => {
    const res = await admin.get('/api/v1/admin/dashboard')
    expect(res.status).toBe(200)
    expect(res.body.data.last7Days).toHaveLength(7)
    expect(res.body.data.salesByHour).toHaveLength(24)
    expect(res.body.data.openOrders).toEqual(expect.objectContaining({ unpaid: expect.any(Number), pending: expect.any(Number) }))
  })

  it('keeps the stock ledger consistent after everything above', async () => {
    const ready = await api().get('/readyz')
    expect(ready.body.data.checks.database).toBe(true)
    expect(ready.body.data.checks.stockLedger).toBe(true)
  })
})
