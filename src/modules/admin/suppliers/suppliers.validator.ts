import { body, checkExact } from 'express-validator'
import { idParam, MONEY_PATTERN } from '@/utils/validators'

const optionalText = (field: string, max: number, label = field) =>
  body(field).optional({ values: 'undefined' })
    .custom((value) => value === null || (typeof value === 'string' && value.trim().length <= max))
    .withMessage(`${label} must be text of at most ${max} characters or null`)
    .customSanitizer((value) => (typeof value === 'string' ? value.trim() || null : value))

const fields = (optional: boolean) => [
  (optional ? body('name').optional() : body('name'))
    .isString().withMessage('name is required').bail().trim()
    .isLength({ min: 1, max: 80 }).withMessage('name must be 1 to 80 characters'),
  optionalText('contactPerson', 80),
  optionalText('phone', 40),
  optionalText('email', 120).custom((value) => value === null || value === undefined || /^\S+@\S+\.\S+$/.test(value))
    .withMessage('email must be a valid address'),
  optionalText('address', 200),
  body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive must be true or false'),
]

export const idRules = [idParam()]
export const createRules = [checkExact(fields(false), { locations: ['body'] })]
export const updateRules = [idParam(), checkExact(fields(true), { locations: ['body'] })]

export const priceListRules = [
  idParam(),
  checkExact(
    [
      body('items').isArray({ max: 200 }).withMessage('items must be an array'),
      body('items.*.ingredientId').isInt({ min: 1 }).withMessage('ingredientId must be a positive integer').toInt(),
      body('items.*.unitCost')
        .customSanitizer((v) => (typeof v === 'number' ? String(v) : v))
        .isString().bail().trim().matches(MONEY_PATTERN).withMessage('unitCost must be an amount with at most 2 decimals'),
      body('items').custom((items: { ingredientId: unknown }[]) => {
        const ids = items.map((item) => Number(item?.ingredientId))
        if (new Set(ids).size !== ids.length) throw new Error('each ingredient may appear only once')
        return true
      }),
    ],
    { locations: ['body'] },
  ),
]
