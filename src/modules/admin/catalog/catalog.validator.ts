import { body, checkExact, query } from 'express-validator'
import { idParam, moneyField, MONEY_PATTERN } from '@/utils/validators'

const PRODUCT_TYPES = ['prepared', 'ready_made']

const name = (optional: boolean) => {
  const chain = body('name')
  return (optional ? chain.optional() : chain)
    .isString().withMessage('name is required')
    .bail()
    .trim()
    .isLength({ min: 1, max: 80 }).withMessage('name must be 1 to 80 characters')
}

const sortOrder = body('sortOrder').optional().isInt({ min: 0, max: 1000 }).withMessage('sortOrder must be 0 to 1000').toInt()

export const createCategoryRules = [checkExact([name(false), sortOrder], { locations: ['body'] })]
export const updateCategoryRules = [idParam(), checkExact([name(true), sortOrder], { locations: ['body'] })]

export const listProductsRules = [
  query('categoryId').optional().isInt({ min: 1 }).withMessage('categoryId must be a positive integer').toInt(),
  query('search').optional().isString().trim().isLength({ max: 80 }),
  query('status').optional().isIn(['all', 'active', 'inactive']).withMessage('status must be all, active or inactive'),
]

const productFields = (optional: boolean) => {
  const req = <T extends { optional: () => T }>(chain: T) => (optional ? chain.optional() : chain)
  return [
    req(body('categoryId')).isInt({ min: 1 }).withMessage('categoryId must be a positive integer').toInt(),
    name(optional),
    body('description').optional({ values: 'undefined' })
      .custom((value) => value === null || (typeof value === 'string' && value.length <= 300))
      .withMessage('description must be text of at most 300 characters or null')
      .customSanitizer((value) => (typeof value === 'string' ? value.trim() || null : value)),
    req(body('productType')).isIn(PRODUCT_TYPES).withMessage('productType must be prepared or ready_made'),
    optional
      ? body('price').optional().customSanitizer((v) => (typeof v === 'number' ? String(v) : v))
          .isString().bail().trim().matches(MONEY_PATTERN).withMessage('price must be an amount with at most 2 decimals')
      : moneyField('price'),
    body('imageUrl').optional({ values: 'undefined' })
      .custom((value) => value === null || (typeof value === 'string' && /^https?:\/\/\S{1,500}$/.test(value)))
      .withMessage('imageUrl must be an http(s) URL or null'),
    body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive must be true or false'),
  ]
}

export const productIdRules = [idParam()]
export const createProductRules = [checkExact(productFields(false), { locations: ['body'] })]
export const updateProductRules = [idParam(), checkExact(productFields(true), { locations: ['body'] })]

export const recipeRules = [
  idParam(),
  checkExact(
    [
      body('lines').isArray({ max: 30 }).withMessage('lines must be an array of at most 30 ingredients'),
      body('lines.*.ingredientId').isInt({ min: 1 }).withMessage('ingredientId must be a positive integer').toInt(),
      body('lines.*.quantity')
        .customSanitizer((v) => (typeof v === 'number' ? String(v) : v))
        .isString().bail().trim()
        .matches(/^\d{1,9}(\.\d{1,3})?$/).withMessage('quantity must be a number with at most 3 decimals')
        .bail()
        .custom((v) => Number(v) > 0).withMessage('quantity must be greater than 0'),
      body('lines').custom((lines: { ingredientId: unknown }[]) => {
        const ids = lines.map((line) => Number(line?.ingredientId))
        if (new Set(ids).size !== ids.length) throw new Error('each ingredient may appear only once')
        return true
      }),
    ],
    { locations: ['body'] },
  ),
]
