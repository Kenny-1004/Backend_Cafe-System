import pool from '@/db/pool'

export type BoardItem = { name: string; quantity: number; notes: string | null; prepared: boolean }

export type BoardCard = {
  id: number
  orderNumber: number
  businessDate: string
  customerName: string
  status: 'pending' | 'serving'
  serviceType: 'dine_in' | 'take_out'
  paidAt: Date
  servingAt: Date | null
  items: BoardItem[]
}

// Pending: first paid, first made. Serving: oldest ready first.
const findCards = async () => {
  const { rows } = await pool.query<BoardCard>(
    `SELECT order_id AS id, order_number AS "orderNumber", business_date AS "businessDate",
            customer_name AS "customerName", status, service_type AS "serviceType",
            paid_at AS "paidAt", serving_at AS "servingAt", items
       FROM v_order_board
      ORDER BY status, coalesce(serving_at, paid_at), order_number`,
  )
  return rows
}

const markServing = async (orderId: number, employeeId: number) => {
  await pool.query('SELECT mark_order_serving($1, $2)', [orderId, employeeId])
}

const completeOrders = async (orderIds: number[], employeeId: number) => {
  const { rows } = await pool.query<{ cleared: number }>(
    'SELECT complete_orders($1::bigint[], $2) AS cleared',
    [orderIds, employeeId],
  )
  return rows[0].cleared
}

export default { findCards, markServing, completeOrders }
