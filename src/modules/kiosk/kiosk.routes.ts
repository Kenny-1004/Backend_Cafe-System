import { Router } from 'express'
import { body, checkExact } from 'express-validator'
import validate from '@/middlewares/validate'
import requireKiosk from '@/middlewares/requireKiosk'
import { pairingRateLimit, placeOrderRateLimit } from '@/middlewares/rateLimit'
import kioskController from '@/modules/kiosk/kiosk.controller'
import { createOrderRules, publicIdRules } from '@/modules/kiosk/kiosk.validator'

const pairRules = [
  checkExact(
    [body('code').isString().withMessage('code is required').bail().trim().matches(/^[A-Za-z0-9 -]{8,12}$/).withMessage('Enter the 8-character code')],
    { locations: ['body'] },
  ),
]

// Kiosk endpoints: only paired tablets (or a manager previewing) may use them.
// Orders are reachable only by their unguessable publicId.
const kioskRoutes = Router()

kioskRoutes.post('/kiosk/pair', pairingRateLimit, pairRules, validate, kioskController.pair)
kioskRoutes.get('/kiosk/session', kioskController.session)

kioskRoutes.get('/menu', requireKiosk, kioskController.getMenu)
kioskRoutes.get('/menu/events', requireKiosk, kioskController.menuEvents)
kioskRoutes.post('/orders', requireKiosk, placeOrderRateLimit, createOrderRules, validate, kioskController.placeOrder)
kioskRoutes.get('/orders/:publicId', requireKiosk, publicIdRules, validate, kioskController.getOrder)
kioskRoutes.get('/orders/:publicId/events', requireKiosk, publicIdRules, validate, kioskController.orderEvents)

export default kioskRoutes
