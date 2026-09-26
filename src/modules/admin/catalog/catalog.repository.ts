import type { PoolClient } from 'pg'
import pool from '@/db/pool'

export type CategoryRow = { id: number; name: string; sortOrder: number; productCount: number }

export type ProductRow = {
  id: number
  categoryId: number
  categoryName: string
  name: string
  description: string | null
  productType: 'prepared' | 'ready_made'
  price: string
  imageUrl: string | null
  isActive: boolean
  isAvailable: boolean
  recipeLines: number
}

export type RecipeLineRow = {
  ingredientId: number
  name: string
  unit: string
  quantity: string
  stockQty: string
  isActive: boolean
}

export type ProductFields = {
  categoryId?: number
  name?: string
  description?: string | null
  productType?: 'prepared' | 'ready_made'
  price?: string
  imageUrl?: string | null
  isActive?: boolean
}

const listCategories = async () => {
  const { rows } = await pool.query<CategoryRow>(
    `SELECT c.id, c.name, c.sort_order AS "sortOrder",
            (SELECT count(*) FROM products p WHERE p.category_id = c.id)::int AS "productCount"
       FROM categories c
      ORDER BY c.sort_order, c.name`,
  )
  return rows
}

const createCategory = async (name: string, sortOrder: number) => {
  const { rows } = await pool.query<{ id: number }>(
    'INSERT INTO categories (name, sort_order) VALUES ($1, $2) RETURNING id',
    [name, sortOrder],
  )
  return rows[0].id
}

const updateCategory = async (id: number, fields: { name?: string; sortOrder?: number }) => {
  const { rowCount } = await pool.query(
    `UPDATE categories
        SET name = coalesce($2, name), sort_order = coalesce($3, sort_order)
      WHERE id = $1`,
    [id, fields.name ?? null, fields.sortOrder ?? null],
  )
  return rowCount === 1
}

const PRODUCT_SELECT = `
  SELECT p.id, p.category_id AS "categoryId", c.name AS "categoryName", p.name, p.description,
         p.product_type AS "productType", p.price, p.image_url AS "imageUrl", p.is_active AS "isActive",
         a.is_available AS "isAvailable",
         (SELECT count(*) FROM product_ingredients pi WHERE pi.product_id = p.id)::int AS "recipeLines"
    FROM products p
    JOIN categories c ON c.id = p.category_id
    JOIN v_product_availability a ON a.product_id = p.id`

const listProducts = async (filters: { categoryId?: number; search?: string; status?: string }) => {
  const { rows } = await pool.query<ProductRow>(
    `${PRODUCT_SELECT}
      WHERE ($1::int IS NULL OR p.category_id = $1)
        AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%')
        AND ($3::text = 'all' OR ($3 = 'active') = p.is_active)
      ORDER BY c.sort_order, c.name, p.name`,
    [filters.categoryId ?? null, filters.search?.replace(/[%_\\]/g, '\\$&') ?? null, filters.status ?? 'all'],
  )
  return rows
}

const findProduct = async (id: number) => {
  const { rows } = await pool.query<ProductRow>(`${PRODUCT_SELECT} WHERE p.id = $1`, [id])
  return rows[0] ?? null
}

const findRecipe = async (productId: number) => {
  const { rows } = await pool.query<RecipeLineRow>(
    `SELECT i.id AS "ingredientId", i.name, i.unit, pi.quantity_required AS quantity,
            i.stock_qty AS "stockQty", i.is_active AS "isActive"
       FROM product_ingredients pi
       JOIN ingredients i ON i.id = pi.ingredient_id
      WHERE pi.product_id = $1
      ORDER BY i.name`,
    [productId],
  )
  return rows
}

const createProduct = async (fields: Required<Pick<ProductFields, 'categoryId' | 'name' | 'productType' | 'price'>> & ProductFields) => {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO products (category_id, name, description, product_type, price, image_url, is_active)
     VALUES ($1, $2, $3, $4, $5::numeric, $6, coalesce($7, true))
     RETURNING id`,
    [fields.categoryId, fields.name, fields.description ?? null, fields.productType, fields.price,
     fields.imageUrl ?? null, fields.isActive ?? null],
  )
  return rows[0].id
}

// Only the provided fields change; description/imageUrl can be cleared with null
const updateProduct = async (id: number, fields: ProductFields) => {
  const { rowCount } = await pool.query(
    `UPDATE products SET
        category_id  = coalesce($2, category_id),
        name         = coalesce($3, name),
        description  = CASE WHEN $4 THEN $5 ELSE description END,
        product_type = coalesce($6::product_type, product_type),
        price        = coalesce($7::numeric, price),
        image_url    = CASE WHEN $8 THEN $9 ELSE image_url END,
        is_active    = coalesce($10, is_active)
      WHERE id = $1`,
    [id, fields.categoryId ?? null, fields.name ?? null,
     fields.description !== undefined, fields.description ?? null,
     fields.productType ?? null, fields.price ?? null,
     fields.imageUrl !== undefined, fields.imageUrl ?? null,
     fields.isActive ?? null],
  )
  return rowCount === 1
}

// Replace a recipe atomically: delete + insert in the caller's transaction
const replaceRecipe = async (client: PoolClient, productId: number, lines: { ingredientId: number; quantity: string }[]) => {
  await client.query('SELECT 1 FROM products WHERE id = $1 FOR UPDATE', [productId])
  await client.query('DELETE FROM product_ingredients WHERE product_id = $1', [productId])
  if (lines.length === 0) return
  await client.query(
    `INSERT INTO product_ingredients (product_id, ingredient_id, quantity_required)
     SELECT $1, x.ingredient_id, x.quantity
       FROM unnest($2::bigint[], $3::numeric[]) AS x(ingredient_id, quantity)`,
    [productId, lines.map((line) => line.ingredientId), lines.map((line) => line.quantity)],
  )
}

export default {
  listCategories,
  createCategory,
  updateCategory,
  listProducts,
  findProduct,
  findRecipe,
  createProduct,
  updateProduct,
  replaceRecipe,
}
