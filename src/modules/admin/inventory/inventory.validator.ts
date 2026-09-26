import { body, checkExact, query } from 'express-validator'
import { idParam } from '@/utils/validators'
import { pageRules } from '@/utils/pagination'

const QTY = /^\d{1,9}(\.\d{1,3})?$/
const SIGNED_QTY = /^-?\d{1,9}(\.\d{1,3})?$/
const UNITS = ['g', 'ml', 'pcs', 'kg', 'l']

const toText = (v: unknown) => (typeof v === 'number' ? String(v) : v)

const quantity = (field: string, pattern: RegExp, message: string, optional = true) => {
  const chain = optional ? body(field).optional() : body(field)
  return chain.customSanitizer(toText).isString().withMessage(message).bail().trim().matches(pattern).withMessage(message)
}

const fields = (optional: boolean) => {
  const opt = <T extends { optional: () => T }>(chain: T) => (optional ? chain.optional() : chain)
  return [
    opt(body('name')).isString().withMessage('name is required').bail().trim()
      .isLength({ min: 1, max: 80 }).withMessage('name must be 1 to 80 characters'),
    opt(body('unit')).isIn(UNITS).withMessage(`unit must be one of ${UNITS.join(', ')}`),
    quantity('reorderLevel', QTY, 'reorderLevel must be a number >= 0 with at most 3 decimals', optional),
    body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive must be true or false'),
  ]
}

export const listRules = [
  query('search').optional().isString().trim().isLength({ max: 80 }),
  query('status').optional().isIn(['all', 'active', 'inactive', 'low']).withMessage('status must be all, active, inactive or low'),
]

export const createRules = [
  checkExact(
    [...fields(false), quantity('openingStock', QTY, 'openingStock must be a number >= 0 with at most 3 decimals')],
    { locations: ['body'] },
  ),
]

export const updateRules = [idParam(), checkExact(fields(true), { locations: ['body'] })]

export const idRules = [idParam()]

export const movementRules = [
  idParam(),
  checkExact(
    [
      body('type').isIn(['restock', 'waste', 'adjustment']).withMessage('type must be restock, waste or adjustment'),
      quantity('quantity', SIGNED_QTY, 'quantity must be a number with at most 3 decimals', false)
        .bail()
        .custom((v) => Number(v) !== 0).withMessage('quantity must not be zero'),
      body('note').optional({ values: 'null' }).isString().withMessage('note must be text').bail().trim()
        .isLength({ max: 200 }).withMessage('note must be 200 characters or fewer'),
      body('quantity').custom((value, { req }) => {
        if (req.body.type !== 'adjustment' && Number(value) < 0) {
          throw new Error('quantity must be positive for restock and waste (waste is subtracted automatically)')
        }
        return true
      }),
      body('note').custom((value, { req }) => {
        if (req.body.type === 'adjustment' && !(typeof value === 'string' && value.trim())) {
          throw new Error('adjustments need a note explaining why')
        }
        return true
      }),
    ],
    { locations: ['body'] },
  ),
]

export const movementsListRules = [idParam(), ...pageRules]
