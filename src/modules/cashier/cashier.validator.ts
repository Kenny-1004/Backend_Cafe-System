import { body, checkExact, param, query } from 'express-validator'
import { idParam, moneyField } from '@/utils/validators'

export const ORDER_STATUSES = ['unpaid', 'pending', 'serving', 'completed', 'cancelled', 'expired']

export const listRules = [
  query('status').optional().isIn(ORDER_STATUSES).withMessage(`status must be one of ${ORDER_STATUSES.join(', ')}`),
]

export const byNumberRules = [
  param('number').isInt({ min: 1, max: 100_000 }).withMessage('number must be a positive integer').toInt(),
]

export const orderIdRules = [idParam()]

export const paymentRules = [
  idParam(),
  checkExact(
    [
      body('customerName')
        .isString().withMessage('customerName is required')
        .bail()
        .trim()
        .isLength({ min: 1, max: 60 }).withMessage('customerName must be 1 to 60 characters'),
      moneyField('cashTendered'),
    ],
    { locations: ['body'] },
  ),
]
