import { Router } from 'express'
import validate from '@/middlewares/validate'
import deliveriesController from '@/modules/admin/deliveries/deliveries.controller'
import { createRules, idRules, listRules, receiveRules } from '@/modules/admin/deliveries/deliveries.validator'

const deliveriesRoutes = Router()

deliveriesRoutes.get('/deliveries', listRules, validate, deliveriesController.list)
deliveriesRoutes.post('/deliveries', createRules, validate, deliveriesController.create)
deliveriesRoutes.get('/deliveries/:id', idRules, validate, deliveriesController.get)
deliveriesRoutes.post('/deliveries/:id/receive', receiveRules, validate, deliveriesController.receive)
deliveriesRoutes.post('/deliveries/:id/cancel', idRules, validate, deliveriesController.cancel)

export default deliveriesRoutes
