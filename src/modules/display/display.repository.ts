import pool from '@/db/pool'

export type DisplayOrder = { orderNumber: number; name: string; since: Date }

// Public screen: only today's order numbers and first names. No items, prices or ids.
const findToday = async () => {
  const { rows } = await pool.query<DisplayOrder & { status: 'pending' | 'serving' }>(
    `SELECT order_number AS "orderNumber",
            left(split_part(btrim(customer_name), ' ', 1), 20) AS name,
            status,
            coalesce(serving_at, paid_at) AS since
       FROM orders
      WHERE status IN ('pending', 'serving') AND business_date = cafe_today()
      ORDER BY coalesce(serving_at, paid_at), order_number`,
  )
  return rows
}

export default { findToday }
