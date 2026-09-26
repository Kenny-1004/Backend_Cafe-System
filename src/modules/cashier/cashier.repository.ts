import pool from '@/db/pool'
import type { OrderStatus } from '@/modules/kiosk/kiosk.types'
import type { CashierOrder, CashierOrderLine, CashierOrderSummary } from '@/modules/cashier/cashier.types'

const SUMMARY_COLUMNS = `
  o.id, o.order_number AS "orderNumber", o.status, o.service_type AS "serviceType",
  o.customer_name AS "customerName", o.total_amount AS total, o.created_at AS "createdAt",
  (SELECT coalesce(sum(oi.quantity), 0)::int FROM order_items oi WHERE oi.order_id = o.id) AS "itemCount"`

// Today's orders in one status (the café day, Asia/Manila)
const listToday = async (status: OrderStatus) => {
  const { rows } = await pool.query<CashierOrderSummary>(
    `SELECT ${SUMMARY_COLUMNS}
       FROM orders o
      WHERE o.business_date = cafe_today() AND o.status = $1
      ORDER BY o.order_number`,
    [status],
  )
  return rows
}

const findOrder = async (where: 'id' | 'number', value: number) => {
  const condition = where === 'id' ? 'o.id = $1' : 'o.business_date = cafe_today() AND o.order_number = $1'
  const header = await pool.query<Omit<CashierOrder, 'items'>>(
    `SELECT ${SUMMARY_COLUMNS}, o.business_date AS "businessDate", o.paid_at AS "paidAt"
       FROM orders o
      WHERE ${condition}`,
    [value],
  )
  const order = header.rows[0]
  if (!order) return null

  const lines = await pool.query<CashierOrderLine>(
    `SELECT product_id AS "productId", product_name AS name, quantity, unit_price AS "unitPrice",
            line_total AS "lineTotal", notes
       FROM order_items WHERE order_id = $1 ORDER BY id`,
    [order.id],
  )
  return { ...order, items: lines.rows }
}

const confirmPayment = async (orderId: number, customerName: string, cashTendered: string, employeeId: number) => {
  const { rows } = await pool.query<{ change: string; cashTendered: string }>(
    `SELECT confirm_payment($1, $2, $3::numeric, $4)::numeric(12,2)::text AS change,
            $3::numeric(12,2)::text AS "cashTendered"`,
    [orderId, customerName, cashTendered, employeeId],
  )
  return rows[0]
}

const cancelOrder = async (orderId: number, employeeId: number) => {
  await pool.query('SELECT cancel_order($1, $2)', [orderId, employeeId])
}

type TodaySummary = {
  unpaidCount: number
  paidCount: number
  paidTotal: string
  myPaidCount: number
  myPaidTotal: string
}

const todaySummary = async (employeeId: number) => {
  const { rows } = await pool.query<TodaySummary>(
    `SELECT
       (SELECT count(*) FROM orders WHERE business_date = cafe_today() AND status = 'unpaid') AS "unpaidCount",
       count(p.id) AS "paidCount",
       coalesce(sum(p.amount_due), 0)::numeric(12,2)::text AS "paidTotal",
       count(p.id) FILTER (WHERE p.received_by = $1) AS "myPaidCount",
       coalesce(sum(p.amount_due) FILTER (WHERE p.received_by = $1), 0)::numeric(12,2)::text AS "myPaidTotal"
     FROM orders o
     JOIN payments p ON p.order_id = o.id
     WHERE o.business_date = cafe_today()`,
    [employeeId],
  )
  return rows[0]
}

export default { listToday, findOrder, confirmPayment, cancelOrder, todaySummary }
