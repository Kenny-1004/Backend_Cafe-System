import { Router } from 'express'
import authenticate from '@/middlewares/authenticate'
import authorize from '@/middlewares/authorize'
import validate from '@/middlewares/validate'
import boardController from '@/modules/board/board.controller'
import { completeRules, serveRules } from '@/modules/board/board.validator'

const boardRoutes = Router()

boardRoutes.use(authenticate, authorize('kitchen', 'cashier', 'admin'))

boardRoutes.get('/', boardController.snapshot)
boardRoutes.get('/events', boardController.events)
boardRoutes.post('/orders/complete', completeRules, validate, boardController.complete)
boardRoutes.post('/orders/:id/serve', serveRules, validate, boardController.serve)

export default boardRoutes
