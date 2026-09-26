import { body, checkExact, query } from 'express-validator'
import { idParam, MONEY_PATTERN } from '@/utils/validators'
import { pageRules } from '@/utils/pagination'

const QTY = /^\d{1,9}(\.\d{1,3})?$/
const toText = (v: unknown) => (typeof v === 'number' ? String(v) : v)

const uniqueIngredients = (field: string) =>
  body(field).custom((rows: { ingredientId: unknown }[]) => {
    const ids = rows.map((row) => Number(row?.ingredientId))
    if (new Set(ids).size !== ids.length) throw new Error('each ingredient may appear only once')
    return true
  })

export const listRules = [
  query('status').optional().isIn(['ordered', 'received', 'cancelled']).withMessage('status must be ordered, received or cancelled'),
  ...pageRules,
]

export const idRules = [idParam()]

export const createRules = [
  checkExact(
    [
      body('supplierId').isInt({ min: 1 }).withMessage('supplierId must be a positive integer').toInt(),
      body('expectedAt').optional({ values: 'null' }).isISO8601({ strict: true }).withMessage('expectedAt must be a date (YYYY-MM-DD)')
        .bail().isLength({ max: 10 }).withMessage('expectedAt must be a date (YYYY-MM-DD)'),
      body('notes').optional({ values: 'null' }).isString().trim().isLength({ max: 300 }).withMessage('notes must be at most 300 characters'),
      body('items').isArray({ min: 1, max: 100 }).withMessage('items must list 1 to 100 ingredients'),
      body('items.*.ingredientId').isInt({ min: 1 }).withMessage('ingredientId must be a positive integer').toInt(),
      body('items.*.quantity').customSanitizer(toText).isString().bail().trim().matches(QTY)
        .withMessage('quantity must be a number with at most 3 decimals').bail()
        .custom((v) => Number(v) > 0).withMessage('quantity must be greater than 0'),
      body('items.*.unitCost').customSanitizer(toText).isString().bail().trim().matches(MONEY_PATTERN)
        .withMessage('unitCost must be an amount with at most 2 decimals'),
      uniqueIngredients('items'),
    ],
    { locations: ['body'] },
  ),
]

export const receiveRules = [
  idParam(),
  checkExact(
    [
      body('received').optional().isArray({ max: 100 }).withMessage('received must be an array'),
      body('received.*.ingredientId').isInt({ min: 1 }).withMessage('ingredientId must be a positive integer').toInt(),
      body('received.*.quantityReceived').customSanitizer(toText).isString().bail().trim().matches(QTY)
        .withMessage('quantityReceived must be a number >= 0 with at most 3 decimals'),
      body('received').optional().custom((rows: { ingredientId: unknown }[]) => {
        const ids = rows.map((row) => Number(row?.ingredientId))
        if (new Set(ids).size !== ids.length) throw new Error('each ingredient may appear only once')
        return true
      }),
    ],
    { locations: ['body'] },
  ),
]
