import { Router } from 'express'
import { query } from 'express-validator'
import validate from '@/middlewares/validate'
import ordersController from '@/modules/admin/orders/orders.controller'
import { pageRules } from '@/utils/pagination'
import { idParam } from '@/utils/validators'

const STATUSES = ['unpaid', 'pending', 'serving', 'completed', 'cancelled', 'expired']

const listRules = [
  query('date').optional().isISO8601({ strict: true }).withMessage('date must be YYYY-MM-DD').bail()
    .isLength({ max: 10 }).withMessage('date must be YYYY-MM-DD'),
  query('status').optional().isIn(STATUSES).withMessage(`status must be one of ${STATUSES.join(', ')}`),
  query('search').optional().isString().isLength({ max: 60 }),
  ...pageRules,
]

const ordersRoutes = Router()

ordersRoutes.get('/orders', listRules, validate, ordersController.list)
ordersRoutes.get('/orders/:id', [idParam()], validate, ordersController.get)

export default ordersRoutes
