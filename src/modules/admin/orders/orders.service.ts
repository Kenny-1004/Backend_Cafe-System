import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import { toPage } from '@/utils/pagination'
import ordersRepository from '@/modules/admin/orders/orders.repository'
import type { OrderStatus } from '@/modules/kiosk/kiosk.types'

const list = async (
  filters: { date: string | null; status: OrderStatus | null; search: string | null },
  limit: number,
  cursor: number | null,
) => toPage(await ordersRepository.list(filters, limit, cursor), limit)

const get = async (id: number) => {
  const order = await ordersRepository.findById(id)
  if (!order) throw new AppError(StatusCodes.NOT_FOUND, 'Order not found', 'NOT_FOUND')
  const [items, payment, history] = await Promise.all([
    ordersRepository.items(id),
    ordersRepository.payment(id),
    ordersRepository.history(id),
  ])
  return { ...order, items, payment, history }
}

export default { list, get }
