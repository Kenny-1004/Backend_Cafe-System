import pool from '@/db/pool'

export type DailySales = { businessDate: string; ordersPaid: number; grossSales: string }
export type BestSeller = { productId: number; productName: string; unitsSold: number; revenue: string }

// One row per day in the range, including days with no sales
const dailySales = async (from: string, to: string) => {
  const { rows } = await pool.query<DailySales>(
    `SELECT d::date::text AS "businessDate",
            coalesce(s.orders_paid, 0)::int AS "ordersPaid",
            coalesce(s.gross_sales, 0)::numeric(12,2)::text AS "grossSales"
       FROM generate_series($1::date, $2::date, interval '1 day') AS d
       LEFT JOIN v_daily_sales s ON s.business_date = d::date
      ORDER BY d`,
    [from, to],
  )
  return rows
}

const bestSellers = async (from: string, to: string, limit: number) => {
  const { rows } = await pool.query<BestSeller>(
    `SELECT product_id AS "productId", max(product_name) AS "productName",
            sum(units_sold)::int AS "unitsSold", sum(revenue)::numeric(12,2)::text AS revenue
       FROM v_product_sales
      WHERE business_date BETWEEN $1 AND $2
      GROUP BY product_id
      ORDER BY sum(units_sold) DESC, sum(revenue) DESC
      LIMIT $3`,
    [from, to, limit],
  )
  return rows
}

type Summary = {
  ordersPaid: number
  grossSales: string
  averageOrder: string
  itemsSold: number
  cancelledOrders: number
  expiredOrders: number
}

const summary = async (from: string, to: string) => {
  const { rows } = await pool.query<Summary>(
    `SELECT count(p.id)::int AS "ordersPaid",
            coalesce(sum(p.amount_due), 0)::numeric(12,2)::text AS "grossSales",
            coalesce(avg(p.amount_due), 0)::numeric(12,2)::text AS "averageOrder",
            coalesce((SELECT sum(oi.quantity) FROM order_items oi JOIN orders o2 ON o2.id = oi.order_id
                       WHERE o2.paid_at IS NOT NULL AND o2.business_date BETWEEN $1 AND $2), 0)::int AS "itemsSold",
            (SELECT count(*) FROM orders o3 WHERE o3.status = 'cancelled' AND o3.business_date BETWEEN $1 AND $2)::int AS "cancelledOrders",
            (SELECT count(*) FROM orders o4 WHERE o4.status = 'expired' AND o4.business_date BETWEEN $1 AND $2)::int AS "expiredOrders"
       FROM orders o
       JOIN payments p ON p.order_id = o.id
      WHERE o.business_date BETWEEN $1 AND $2`,
    [from, to],
  )
  return rows[0]
}

const openOrders = async () => {
  const { rows } = await pool.query<{ unpaid: number; pending: number; serving: number }>(
    `SELECT count(*) FILTER (WHERE status = 'unpaid')::int  AS unpaid,
            count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'serving')::int AS serving
       FROM orders
      WHERE status IN ('unpaid', 'pending', 'serving')`,
  )
  return rows[0]
}

// Sales per hour of today in café time, for the dashboard chart
const salesByHourToday = async () => {
  const { rows } = await pool.query<{ hour: number; orders: number; sales: string }>(
    `SELECT h AS hour, count(p.id)::int AS orders, coalesce(sum(p.amount_due), 0)::numeric(12,2)::text AS sales
       FROM generate_series(0, 23) AS h
       LEFT JOIN payments p
              ON (p.paid_at AT TIME ZONE 'Asia/Manila')::date = cafe_today()
             AND extract(hour FROM p.paid_at AT TIME ZONE 'Asia/Manila') = h
      GROUP BY h
      ORDER BY h`,
  )
  return rows
}

const today = async () => (await pool.query<{ today: string }>('SELECT cafe_today()::text AS today')).rows[0].today

export default { dailySales, bestSellers, summary, openOrders, salesByHourToday, today }
