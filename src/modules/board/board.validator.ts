import { body, checkExact } from 'express-validator'
import { idParam } from '@/utils/validators'

export const serveRules = [idParam()]

export const completeRules = [
  checkExact(
    [
      body('orderIds').isArray({ min: 1, max: 50 }).withMessage('orderIds must list 1 to 50 orders'),
      body('orderIds.*').isInt({ min: 1, max: Number.MAX_SAFE_INTEGER }).withMessage('each order id must be a positive integer').toInt(),
    ],
    { locations: ['body'] },
  ),
]
