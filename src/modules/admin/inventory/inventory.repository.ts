import type { Pool, PoolClient } from 'pg'
import pool from '@/db/pool'

export type IngredientRow = {
  id: number
  name: string
  unit: string
  stockQty: string
  reorderLevel: string
  isActive: boolean
  isLow: boolean
  usedInProducts: number
  createdAt: Date
}

export type MovementRow = {
  id: number
  movementType: 'delivery' | 'restock' | 'sale' | 'adjustment' | 'waste'
  quantityDelta: string
  note: string | null
  orderId: number | null
  orderNumber: number | null
  deliveryId: number | null
  employeeName: string | null
  createdAt: Date
}

const INGREDIENT_SELECT = `
  SELECT i.id, i.name, i.unit, i.stock_qty AS "stockQty", i.reorder_level AS "reorderLevel",
         i.is_active AS "isActive", (i.is_active AND i.stock_qty <= i.reorder_level) AS "isLow",
         (SELECT count(*) FROM product_ingredients pi WHERE pi.ingredient_id = i.id)::int AS "usedInProducts",
         i.created_at AS "createdAt"
    FROM ingredients i`

const list = async (filters: { search?: string; status?: string }) => {
  const { rows } = await pool.query<IngredientRow>(
    `${INGREDIENT_SELECT}
      WHERE ($1::text IS NULL OR i.name ILIKE '%' || $1 || '%')
        AND ($2::text = 'all'
             OR ($2 = 'active' AND i.is_active)
             OR ($2 = 'inactive' AND NOT i.is_active)
             OR ($2 = 'low' AND i.is_active AND i.stock_qty <= i.reorder_level))
      ORDER BY i.name`,
    [filters.search?.replace(/[%_\\]/g, '\\$&') ?? null, filters.status ?? 'all'],
  )
  return rows
}

const findById = async (id: number) => {
  const { rows } = await pool.query<IngredientRow>(`${INGREDIENT_SELECT} WHERE i.id = $1`, [id])
  return rows[0] ?? null
}

const create = async (client: PoolClient, fields: { name: string; unit: string; reorderLevel: string; isActive?: boolean }) => {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO ingredients (name, unit, reorder_level, is_active)
     VALUES ($1, $2, $3::numeric, coalesce($4, true))
     RETURNING id`,
    [fields.name, fields.unit, fields.reorderLevel, fields.isActive ?? null],
  )
  return rows[0].id
}

// stock_qty is never written here: only the ledger trigger changes it
const update = async (id: number, fields: { name?: string; unit?: string; reorderLevel?: string; isActive?: boolean }) => {
  const { rowCount } = await pool.query(
    `UPDATE ingredients SET
        name          = coalesce($2, name),
        unit          = coalesce($3, unit),
        reorder_level = coalesce($4::numeric, reorder_level),
        is_active     = coalesce($5, is_active)
      WHERE id = $1`,
    [id, fields.name ?? null, fields.unit ?? null, fields.reorderLevel ?? null, fields.isActive ?? null],
  )
  return rowCount === 1
}

const recordMovement = async (
  db: Pool | PoolClient, // a pool, or a client inside a transaction
  ingredientId: number,
  type: 'restock' | 'waste' | 'adjustment',
  quantity: string,
  note: string | null,
  employeeId: number,
) => {
  const { rows } = await db.query<{ stockQty: string }>(
    'SELECT record_stock_movement($1, $2::movement_type, $3::numeric, $4, $5)::text AS "stockQty"',
    [ingredientId, type, quantity, note, employeeId],
  )
  return rows[0].stockQty
}

const listMovements = async (ingredientId: number, limit: number, cursor: number | null) => {
  const { rows } = await pool.query<MovementRow>(
    `SELECT m.id, m.movement_type AS "movementType", m.quantity_delta AS "quantityDelta", m.note,
            m.order_id AS "orderId", o.order_number AS "orderNumber", di.delivery_id AS "deliveryId",
            e.full_name AS "employeeName", m.created_at AS "createdAt"
       FROM stock_movements m
       LEFT JOIN orders o          ON o.id = m.order_id
       LEFT JOIN delivery_items di ON di.id = m.delivery_item_id
       LEFT JOIN employees e       ON e.id = m.employee_id
      WHERE m.ingredient_id = $1 AND ($2::bigint IS NULL OR m.id < $2)
      ORDER BY m.id DESC
      LIMIT $3`,
    [ingredientId, cursor, limit + 1],
  )
  return rows
}

const lowStock = async () => {
  const { rows } = await pool.query<{ id: number; name: string; unit: string; stockQty: string; reorderLevel: string }>(
    `SELECT ingredient_id AS id, name, unit, stock_qty AS "stockQty", reorder_level AS "reorderLevel"
       FROM v_low_stock
      ORDER BY (stock_qty / NULLIF(reorder_level, 0)) NULLS FIRST, name`,
  )
  return rows
}

export default { list, findById, create, update, recordMovement, listMovements, lowStock }
