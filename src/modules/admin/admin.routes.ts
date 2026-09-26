import { Router } from 'express'
import authenticate from '@/middlewares/authenticate'
import authorize from '@/middlewares/authorize'
import catalogRoutes from '@/modules/admin/catalog/catalog.routes'
import inventoryRoutes from '@/modules/admin/inventory/inventory.routes'
import suppliersRoutes from '@/modules/admin/suppliers/suppliers.routes'
import deliveriesRoutes from '@/modules/admin/deliveries/deliveries.routes'
import staffRoutes from '@/modules/admin/staff/staff.routes'
import ordersRoutes from '@/modules/admin/orders/orders.routes'
import reportsRoutes from '@/modules/admin/reports/reports.routes'
import kiosksRoutes from '@/modules/admin/kiosks/kiosks.routes'

// Everything under /admin is manager-only
const adminRoutes = Router()

adminRoutes.use(authenticate, authorize('admin'))
adminRoutes.use(catalogRoutes)
adminRoutes.use(inventoryRoutes)
adminRoutes.use(suppliersRoutes)
adminRoutes.use(deliveriesRoutes)
adminRoutes.use(staffRoutes)
adminRoutes.use(ordersRoutes)
adminRoutes.use(reportsRoutes)
adminRoutes.use(kiosksRoutes)

export default adminRoutes
