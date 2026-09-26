import type { PoolClient } from 'pg'
import pool from '@/db/pool'

export type SupplierFields = {
  name?: string
  contactPerson?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  isActive?: boolean
}

export type SupplierRow = {
  id: number
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  address: string | null
  isActive: boolean
  ingredientCount: number
  openDeliveries: number
  createdAt: Date
}

export type PriceListRow = { ingredientId: number; name: string; unit: string; unitCost: string }

const SELECT = `
  SELECT s.id, s.name, s.contact_person AS "contactPerson", s.phone, s.email, s.address,
         s.is_active AS "isActive",
         (SELECT count(*) FROM supplier_ingredients si WHERE si.supplier_id = s.id)::int AS "ingredientCount",
         (SELECT count(*) FROM deliveries d WHERE d.supplier_id = s.id AND d.status = 'ordered')::int AS "openDeliveries",
         s.created_at AS "createdAt"
    FROM suppliers s`

const list = async () => (await pool.query<SupplierRow>(`${SELECT} ORDER BY s.name`)).rows

const findById = async (id: number) => (await pool.query<SupplierRow>(`${SELECT} WHERE s.id = $1`, [id])).rows[0] ?? null

const priceList = async (supplierId: number) => {
  const { rows } = await pool.query<PriceListRow>(
    `SELECT i.id AS "ingredientId", i.name, i.unit, si.unit_cost AS "unitCost"
       FROM supplier_ingredients si
       JOIN ingredients i ON i.id = si.ingredient_id
      WHERE si.supplier_id = $1
      ORDER BY i.name`,
    [supplierId],
  )
  return rows
}

const create = async (fields: SupplierFields & { name: string }) => {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO suppliers (name, contact_person, phone, email, address, is_active)
     VALUES ($1, $2, $3, $4, $5, coalesce($6, true)) RETURNING id`,
    [fields.name, fields.contactPerson ?? null, fields.phone ?? null, fields.email ?? null,
     fields.address ?? null, fields.isActive ?? null],
  )
  return rows[0].id
}

// Nullable contact fields: only those present in the request change (null clears them)
const update = async (id: number, fields: SupplierFields) => {
  const has = (key: keyof SupplierFields) => fields[key] !== undefined
  const { rowCount } = await pool.query(
    `UPDATE suppliers SET
        name           = coalesce($2, name),
        contact_person = CASE WHEN $3 THEN $4 ELSE contact_person END,
        phone          = CASE WHEN $5 THEN $6 ELSE phone END,
        email          = CASE WHEN $7 THEN $8 ELSE email END,
        address        = CASE WHEN $9 THEN $10 ELSE address END,
        is_active      = coalesce($11, is_active)
      WHERE id = $1`,
    [id, fields.name ?? null,
     has('contactPerson'), fields.contactPerson ?? null,
     has('phone'), fields.phone ?? null,
     has('email'), fields.email ?? null,
     has('address'), fields.address ?? null,
     fields.isActive ?? null],
  )
  return rowCount === 1
}

const replacePriceList = async (client: PoolClient, supplierId: number, items: { ingredientId: number; unitCost: string }[]) => {
  await client.query('SELECT 1 FROM suppliers WHERE id = $1 FOR UPDATE', [supplierId])
  await client.query('DELETE FROM supplier_ingredients WHERE supplier_id = $1', [supplierId])
  if (items.length === 0) return
  await client.query(
    `INSERT INTO supplier_ingredients (supplier_id, ingredient_id, unit_cost)
     SELECT $1, x.ingredient_id, x.unit_cost
       FROM unnest($2::bigint[], $3::numeric[]) AS x(ingredient_id, unit_cost)`,
    [supplierId, items.map((item) => item.ingredientId), items.map((item) => item.unitCost)],
  )
}

export default { list, findById, priceList, create, update, replacePriceList }
