import { body, param } from 'express-validator'

// Money as a decimal string or number with at most 2 decimals ("500", "500.5", 500.25)
export const MONEY_PATTERN = /^\d{1,8}(\.\d{1,2})?$/

export const moneyField = (field: string, label = field) =>
  body(field)
    .exists({ values: 'null' })
    .withMessage(`${label} is required`)
    .bail()
    .customSanitizer((value) => (typeof value === 'number' ? String(value) : value))
    .isString()
    .withMessage(`${label} must be an amount`)
    .bail()
    .trim()
    .matches(MONEY_PATTERN)
    .withMessage(`${label} must be an amount with at most 2 decimals`)

// Stock quantities: up to 3 decimals (grams, millilitres, pieces)
export const QUANTITY_PATTERN = /^-?\d{1,9}(\.\d{1,3})?$/

export const idParam = (name = 'id') =>
  param(name).isInt({ min: 1, max: Number.MAX_SAFE_INTEGER }).withMessage(`${name} must be a positive integer`).toInt()
