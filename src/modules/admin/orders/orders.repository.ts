import pool from '@/db/pool'
import type { OrderStatus, ServiceType } from '@/modules/kiosk/kiosk.types'

export type AdminOrderSummary = {
  id: number
  orderNumber: number
  businessDate: string
  status: OrderStatus
  serviceType: ServiceType
  customerName: string | null
  total: string
  itemCount: number
  createdAt: Date
  paidAt: Date | null
  closedAt: Date | null
}

const SELECT = `
  SELECT o.id, o.order_number AS "orderNumber", o.business_date AS "businessDate", o.status,
         o.service_type AS "serviceType", o.customer_name AS "customerName", o.total_amount AS total,
         (SELECT coalesce(sum(oi.quantity), 0)::int FROM order_items oi WHERE oi.order_id = o.id) AS "itemCount",
         o.created_at AS "createdAt", o.paid_at AS "paidAt", o.closed_at AS "closedAt"
    FROM orders o`

const list = async (
  filters: { date: string | null; status: OrderStatus | null; search: string | null },
  limit: number,
  cursor: number | null,
) => {
  const searchNumber = filters.search && /^\d{1,6}$/.test(filters.search) ? Number(filters.search) : null
  const { rows } = await pool.query<AdminOrderSummary>(
    `${SELECT}
      WHERE ($1::date IS NULL OR o.business_date = $1)
        AND ($2::order_status IS NULL OR o.status = $2)
        AND ($3::text IS NULL OR o.order_number = $4 OR o.customer_name ILIKE '%' || $3 || '%')
        AND ($5::bigint IS NULL OR o.id < $5)
      ORDER BY o.id DESC
      LIMIT $6`,
    [filters.date, filters.status, filters.search?.replace(/[%_\\]/g, '\\$&') ?? null, searchNumber, cursor, limit + 1],
  )
  return rows
}

const findById = async (id: number) => (await pool.query<AdminOrderSummary>(`${SELECT} WHERE o.id = $1`, [id])).rows[0] ?? null

const items = async (orderId: number) => {
  const { rows } = await pool.query(
    `SELECT product_id AS "productId", product_name AS name, quantity, unit_price AS "unitPrice",
            line_total AS "lineTotal", notes
       FROM order_items WHERE order_id = $1 ORDER BY id`,
    [orderId],
  )
  return rows as { productId: number; name: string; quantity: number; unitPrice: string; lineTotal: string; notes: string | null }[]
}

const payment = async (orderId: number) => {
  const { rows } = await pool.query(
    `SELECT p.amount_due AS "amountDue", p.cash_tendered AS "cashTendered", p.change_given AS "changeGiven",
            p.paid_at AS "paidAt", e.full_name AS "receivedByName"
       FROM payments p JOIN employees e ON e.id = p.received_by
      WHERE p.order_id = $1`,
    [orderId],
  )
  return (rows[0] ?? null) as { amountDue: string; cashTendered: string; changeGiven: string; paidAt: Date; receivedByName: string } | null
}

// Who moved the order and when (NULL changed_by = kiosk or the expiry job)
const history = async (orderId: number) => {
  const { rows } = await pool.query(
    `SELECT h.id, h.from_status AS "fromStatus", h.to_status AS "toStatus", h.changed_at AS "changedAt",
            e.full_name AS "changedByName"
       FROM order_status_history h LEFT JOIN employees e ON e.id = h.changed_by
      WHERE h.order_id = $1
      ORDER BY h.changed_at, h.id`,
    [orderId],
  )
  return rows as { id: number; fromStatus: OrderStatus | null; toStatus: OrderStatus; changedAt: Date; changedByName: string | null }[]
}

export default { list, findById, items, payment, history }
