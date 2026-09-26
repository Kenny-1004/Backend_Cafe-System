import { afterAll, describe, expect, it } from 'vitest'
import pool from '@/db/pool'

afterAll(() => pool.end())

// The API connects as a member of cafe_app (design §7). Even with a bug or an injected
// query, it cannot change money or stock records except through the business functions.
describe('least-privilege database role', () => {
  it('connects as a plain member of cafe_app', async () => {
    const { rows } = await pool.query<{ user: string; superuser: boolean; member: boolean }>(
      `SELECT current_user AS user, rolsuper AS superuser, pg_has_role(current_user, 'cafe_app', 'member') AS member
         FROM pg_roles WHERE rolname = current_user`,
    )
    expect(rows[0]).toEqual({ user: 'cafe_api_test', superuser: false, member: true })
  })

  it.each([
    ['change an order status', "UPDATE orders SET status = 'completed'"],
    ['change an order total', 'UPDATE orders SET total_amount = 0'],
    ['insert a payment', 'INSERT INTO payments (order_id, amount_due, cash_tendered, received_by) VALUES (1, 0, 0, 1)'],
    ['write stock directly', 'UPDATE ingredients SET stock_qty = 999999'],
    ['write the stock ledger', "INSERT INTO stock_movements (ingredient_id, movement_type, quantity_delta, note) VALUES (1, 'adjustment', 5, 'x')"],
    ['delete order history', 'DELETE FROM order_status_history'],
    ['change a delivery', "UPDATE deliveries SET status = 'received'"],
    ['read the migration table', 'SELECT * FROM schema_migrations'],
  ])('cannot %s', async (_label, sql) => {
    await expect(pool.query(sql)).rejects.toMatchObject({ code: '42501' }) // insufficient_privilege
  })

  it('can still do everything through the business functions', async () => {
    const { rows } = await pool.query<{ qty: string }>(
      `SELECT record_stock_movement((SELECT id FROM ingredients WHERE name = 'Ice'), 'restock', 1, 'role test',
                                    (SELECT id FROM employees WHERE username = 'admin'))::text AS qty`,
    )
    expect(Number(rows[0].qty)).toBeGreaterThan(0)
  })

  it('can manage catalog data it owns', async () => {
    await expect(pool.query("UPDATE ingredients SET reorder_level = reorder_level WHERE name = 'Ice'")).resolves.toBeDefined()
    await expect(pool.query("UPDATE products SET price = price WHERE id = 1")).resolves.toBeDefined()
  })
})
