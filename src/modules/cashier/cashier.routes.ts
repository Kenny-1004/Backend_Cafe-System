import { Router } from 'express'
import authenticate from '@/middlewares/authenticate'
import authorize from '@/middlewares/authorize'
import validate from '@/middlewares/validate'
import cashierController from '@/modules/cashier/cashier.controller'
import { byNumberRules, listRules, orderIdRules, paymentRules } from '@/modules/cashier/cashier.validator'

const cashierRoutes = Router()

cashierRoutes.use(authenticate, authorize('cashier', 'admin'))

cashierRoutes.get('/summary', cashierController.summary)
cashierRoutes.get('/events', cashierController.events)
cashierRoutes.get('/orders', listRules, validate, cashierController.list)
cashierRoutes.get('/orders/by-number/:number', byNumberRules, validate, cashierController.byNumber)
cashierRoutes.get('/orders/:id', orderIdRules, validate, cashierController.byId)
cashierRoutes.post('/orders/:id/payment', paymentRules, validate, cashierController.pay)
cashierRoutes.post('/orders/:id/cancel', orderIdRules, validate, cashierController.cancel)

export default cashierRoutes
