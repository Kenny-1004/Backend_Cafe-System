import { query } from 'express-validator'
import type { Request } from 'express'

export type Page<T> = { items: T[]; nextCursor: string | null }

// Keyset pagination on descending ids: ?limit=50&cursor=<last id seen>.
// Stable while new rows arrive, and never scans skipped rows like OFFSET does.
export const pageRules = [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1 to 100').toInt(),
  query('cursor').optional().isInt({ min: 1 }).withMessage('cursor must be a positive integer').toInt(),
]

export const readPage = (req: Request) => ({
  limit: Number(req.query.limit ?? 50),
  cursor: req.query.cursor ? Number(req.query.cursor) : null,
})

// Fetch limit + 1 rows; the extra row only tells whether another page exists
export function toPage<T extends { id: number }>(rows: T[], limit: number): Page<T> {
  const items = rows.slice(0, limit)
  return { items, nextCursor: rows.length > limit ? String(items[items.length - 1].id) : null }
}
