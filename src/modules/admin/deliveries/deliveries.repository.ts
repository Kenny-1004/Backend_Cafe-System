import pool from '@/db/pool'

export type DeliveryStatus = 'ordered' | 'received' | 'cancelled'

export type DeliverySummary = {
  id: number
  supplierId: number
  supplierName: string
  status: DeliveryStatus
  orderedAt: Date
  expectedAt: string | null
  receivedAt: Date | null
  notes: string | null
  itemCount: number
  totalCost: string
  createdByName: string
  receivedByName: string | null
}

export type DeliveryItem = {
  id: number
  ingredientId: number
  name: string
  unit: string
  quantityOrdered: string
  quantityReceived: string | null
  unitCost: string
  lineCost: string
}

const SELECT = `
  SELECT d.id, d.supplier_id AS "supplierId", s.name AS "supplierName", d.status,
         d.ordered_at AS "orderedAt", d.expected_at AS "expectedAt", d.received_at AS "receivedAt", d.notes,
         (SELECT count(*) FROM delivery_items di WHERE di.delivery_id = d.id)::int AS "itemCount",
         (SELECT coalesce(sum(coalesce(di.quantity_received, di.quantity_ordered) * di.unit_cost), 0)::numeric(12,2)::text
            FROM delivery_items di WHERE di.delivery_id = d.id) AS "totalCost",
         cb.full_name AS "createdByName", rb.full_name AS "receivedByName"
    FROM deliveries d
    JOIN suppliers s  ON s.id = d.supplier_id
    JOIN employees cb ON cb.id = d.created_by
    LEFT JOIN employees rb ON rb.id = d.received_by`

const list = async (status: DeliveryStatus | null, limit: number, cursor: number | null) => {
  const { rows } = await pool.query<DeliverySummary>(
    `${SELECT}
      WHERE ($1::delivery_status IS NULL OR d.status = $1)
        AND ($2::bigint IS NULL OR d.id < $2)
      ORDER BY d.id DESC
      LIMIT $3`,
    [status, cursor, limit + 1],
  )
  return rows
}

const findById = async (id: number) => (await pool.query<DeliverySummary>(`${SELECT} WHERE d.id = $1`, [id])).rows[0] ?? null

const items = async (deliveryId: number) => {
  const { rows } = await pool.query<DeliveryItem>(
    `SELECT di.id, di.ingredient_id AS "ingredientId", i.name, i.unit,
            di.quantity_ordered AS "quantityOrdered", di.quantity_received AS "quantityReceived",
            di.unit_cost AS "unitCost",
            (coalesce(di.quantity_received, di.quantity_ordered) * di.unit_cost)::numeric(12,2)::text AS "lineCost"
       FROM delivery_items di
       JOIN ingredients i ON i.id = di.ingredient_id
      WHERE di.delivery_id = $1
      ORDER BY i.name`,
    [deliveryId],
  )
  return rows
}

const create = async (
  supplierId: number,
  items: { ingredientId: number; quantity: string; unitCost: string }[],
  expectedAt: string | null,
  notes: string | null,
  employeeId: number,
) => {
  const { rows } = await pool.query<{ id: number }>(
    'SELECT create_delivery($1, $2::jsonb, $3::date, $4, $5) AS id',
    [supplierId, JSON.stringify(items), expectedAt, notes, employeeId],
  )
  return rows[0].id
}

const receive = async (id: number, received: { ingredientId: number; quantityReceived: string }[], employeeId: number) => {
  await pool.query('SELECT receive_delivery($1, $2::jsonb, $3)', [id, JSON.stringify(received), employeeId])
}

const cancel = async (id: number, employeeId: number) => {
  await pool.query('SELECT cancel_delivery($1, $2)', [id, employeeId])
}

export default { list, findById, items, create, receive, cancel }
