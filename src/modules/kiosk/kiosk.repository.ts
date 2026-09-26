import pool from '@/db/pool'
import type { CreateOrderInput, OrderLine, OrderStatus, ServiceType } from '@/modules/kiosk/kiosk.types'

type MenuRow = {
  productId: number
  categoryId: number
  categoryName: string
  name: string
  description: string | null
  productType: 'prepared' | 'ready_made'
  price: string
  imageUrl: string | null
  isAvailable: boolean
}

// Active products only; sold-out ones are still listed (greyed out on the kiosk)
const findMenu = async () => {
  const { rows } = await pool.query<MenuRow>(
    `SELECT product_id AS "productId", category_id AS "categoryId", category_name AS "categoryName",
            name, description, product_type AS "productType", price, image_url AS "imageUrl",
            is_available AS "isAvailable"
       FROM v_product_availability
      WHERE is_active
      ORDER BY category_sort, category_name, name`,
  )
  return rows
}

const createOrder = async ({ items, serviceType, idempotencyKey }: CreateOrderInput) => {
  const { rows } = await pool.query<{ publicId: string }>(
    `SELECT public_id AS "publicId" FROM create_order($1::jsonb, $2::service_type, $3::uuid)`,
    [JSON.stringify(items), serviceType, idempotencyKey],
  )
  return rows[0]
}

type OrderHeaderRow = {
  publicId: string
  orderNumber: number
  businessDate: string
  status: OrderStatus
  serviceType: ServiceType
  total: string
  createdAt: Date
}

const findOrderByPublicId = async (publicId: string) => {
  const header = await pool.query<OrderHeaderRow & { id: number }>(
    `SELECT id, public_id AS "publicId", order_number AS "orderNumber", business_date AS "businessDate",
            status, service_type AS "serviceType", total_amount AS total, created_at AS "createdAt"
       FROM orders
      WHERE public_id = $1`,
    [publicId],
  )
  const order = header.rows[0]
  if (!order) return null

  const lines = await pool.query<OrderLine>(
    `SELECT product_id AS "productId", product_name AS name, quantity, unit_price AS "unitPrice",
            line_total AS "lineTotal", notes
       FROM order_items
      WHERE order_id = $1
      ORDER BY id`,
    [order.id],
  )
  return { order, lines: lines.rows }
}

export default { findMenu, createOrder, findOrderByPublicId }
