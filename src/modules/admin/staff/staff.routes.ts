import { Router } from 'express'
import validate from '@/middlewares/validate'
import staffController from '@/modules/admin/staff/staff.controller'
import { createRules, idRules, updateRules } from '@/modules/admin/staff/staff.validator'

const staffRoutes = Router()

staffRoutes.get('/employees', staffController.list)
staffRoutes.post('/employees', createRules, validate, staffController.create)
staffRoutes.get('/employees/:id', idRules, validate, staffController.get)
staffRoutes.patch('/employees/:id', updateRules, validate, staffController.update)

export default staffRoutes
