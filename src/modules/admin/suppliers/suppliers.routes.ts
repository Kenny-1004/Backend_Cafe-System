import { Router } from 'express'
import validate from '@/middlewares/validate'
import suppliersController from '@/modules/admin/suppliers/suppliers.controller'
import { createRules, idRules, priceListRules, updateRules } from '@/modules/admin/suppliers/suppliers.validator'

const suppliersRoutes = Router()

suppliersRoutes.get('/suppliers', suppliersController.list)
suppliersRoutes.post('/suppliers', createRules, validate, suppliersController.create)
suppliersRoutes.get('/suppliers/:id', idRules, validate, suppliersController.get)
suppliersRoutes.patch('/suppliers/:id', updateRules, validate, suppliersController.update)
suppliersRoutes.put('/suppliers/:id/ingredients', priceListRules, validate, suppliersController.replacePriceList)

export default suppliersRoutes
