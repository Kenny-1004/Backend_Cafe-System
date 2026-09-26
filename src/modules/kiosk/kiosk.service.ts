import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import kioskRepository from '@/modules/kiosk/kiosk.repository'
import type { CreateOrderInput, KioskOrder, MenuCategory } from '@/modules/kiosk/kiosk.types'

const getMenu = async (): Promise<MenuCategory[]> => {
  const rows = await kioskRepository.findMenu()
  const categories = new Map<number, MenuCategory>()

  for (const row of rows) {
    let category = categories.get(row.categoryId)
    if (!category) {
      category = { id: row.categoryId, name: row.categoryName, products: [] }
      categories.set(row.categoryId, category)
    }
    category.products.push({
      id: row.productId,
      name: row.name,
      description: row.description,
      productType: row.productType,
      price: row.price,
      imageUrl: row.imageUrl,
      isAvailable: row.isAvailable,
    })
  }

  return [...categories.values()]
}

const getOrder = async (publicId: string): Promise<KioskOrder> => {
  const found = await kioskRepository.findOrderByPublicId(publicId)
  if (!found) throw new AppError(StatusCodes.NOT_FOUND, 'Order not found', 'NOT_FOUND')

  const { order, lines } = found
  return {
    publicId: order.publicId,
    orderNumber: order.orderNumber,
    businessDate: order.businessDate,
    status: order.status,
    serviceType: order.serviceType,
    total: order.total,
    createdAt: order.createdAt.toISOString(),
    items: lines,
  }
}

// Business rules (availability, limits, price snapshot, daily number) run inside create_order()
const placeOrder = async (input: CreateOrderInput): Promise<KioskOrder> => {
  const created = await kioskRepository.createOrder(input)
  return getOrder(created.publicId)
}

export default { getMenu, getOrder, placeOrder }
