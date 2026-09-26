import { Router } from 'express'
import validate from '@/middlewares/validate'
import inventoryController from '@/modules/admin/inventory/inventory.controller'
import {
  createRules,
  idRules,
  listRules,
  movementRules,
  movementsListRules,
  updateRules,
} from '@/modules/admin/inventory/inventory.validator'

const inventoryRoutes = Router()

inventoryRoutes.get('/ingredients', listRules, validate, inventoryController.list)
inventoryRoutes.post('/ingredients', createRules, validate, inventoryController.create)
inventoryRoutes.get('/ingredients/:id', idRules, validate, inventoryController.get)
inventoryRoutes.patch('/ingredients/:id', updateRules, validate, inventoryController.update)
inventoryRoutes.post('/ingredients/:id/movements', movementRules, validate, inventoryController.recordMovement)
inventoryRoutes.get('/ingredients/:id/movements', movementsListRules, validate, inventoryController.listMovements)
inventoryRoutes.get('/stock/low', inventoryController.lowStock)
inventoryRoutes.get('/events', inventoryController.events)

export default inventoryRoutes
