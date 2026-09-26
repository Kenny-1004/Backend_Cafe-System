import { body, checkExact, header, param } from 'express-validator'

const ORDER_LINE_FIELDS = ['productId', 'quantity', 'notes']

// checkExact rejects unknown top-level fields; body('items') marks everything under
// items as known, so each line's keys are checked here instead.
const isOrderLine = (line: unknown) => {
  if (typeof line !== 'object' || line === null || Array.isArray(line)) {
    throw new Error('each item must be an object')
  }
  const unknown = Object.keys(line).filter((key) => !ORDER_LINE_FIELDS.includes(key))
  if (unknown.length > 0) throw new Error(`unknown field(s): ${unknown.join(', ')}`)
  return true
}

export const createOrderRules = checkExact(
  [
    header('idempotency-key')
      .exists()
      .withMessage('Idempotency-Key header is required')
      .bail()
      .isUUID()
      .withMessage('Idempotency-Key must be a UUID'),
    body('serviceType')
      .optional()
      .isIn(['dine_in', 'take_out'])
      .withMessage('serviceType must be dine_in or take_out'),
    body('items')
      .isArray({ min: 1, max: 30 })
      .withMessage('items must be an array of 1 to 30 lines'),
    body('items.*').custom(isOrderLine),
    body('items.*.productId')
      .isInt({ min: 1, max: Number.MAX_SAFE_INTEGER })
      .withMessage('productId must be a positive integer')
      .toInt(),
    body('items.*.quantity')
      .isInt({ min: 1, max: 50 })
      .withMessage('quantity must be between 1 and 50')
      .toInt(),
    body('items.*.notes')
      .optional({ values: 'null' })
      .isString()
      .withMessage('notes must be text')
      .bail()
      .trim()
      .isLength({ max: 200 })
      .withMessage('notes must be 200 characters or fewer'),
  ],
  { locations: ['body'] },
)

export const publicIdRules = [
  param('publicId').isUUID().withMessage('publicId must be a UUID'),
]
