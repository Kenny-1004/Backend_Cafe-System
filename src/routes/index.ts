import { Router } from 'express'
import authRoutes from '@/modules/auth/auth.routes'
import kioskRoutes from '@/modules/kiosk/kiosk.routes'
import cashierRoutes from '@/modules/cashier/cashier.routes'
import boardRoutes from '@/modules/board/board.routes'
import adminRoutes from '@/modules/admin/admin.routes'
import displayRoutes from '@/modules/display/display.routes'

const routes = Router()

routes.use('/auth', authRoutes)
routes.use('/cashier', cashierRoutes)
routes.use('/board', boardRoutes)
routes.use('/admin', adminRoutes)
routes.use('/display', displayRoutes) // public now-serving screen
routes.use('/', kioskRoutes) // public kiosk endpoints last: /menu, /orders

export default routes
