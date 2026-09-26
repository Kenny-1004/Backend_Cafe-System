import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import { toPage } from '@/utils/pagination'
import deliveriesRepository, { type DeliveryStatus } from '@/modules/admin/deliveries/deliveries.repository'

const get = async (id: number) => {
  const delivery = await deliveriesRepository.findById(id)
  if (!delivery) throw new AppError(StatusCodes.NOT_FOUND, 'Delivery not found', 'NOT_FOUND')
  return { ...delivery, items: await deliveriesRepository.items(id) }
}

const list = async (status: DeliveryStatus | null, limit: number, cursor: number | null) =>
  toPage(await deliveriesRepository.list(status, limit, cursor), limit)

const create = async (
  input: { supplierId: number; items: { ingredientId: number; quantity: string; unitCost: string }[]; expectedAt?: string | null; notes?: string | null },
  employeeId: number,
) => {
  const id = await deliveriesRepository.create(input.supplierId, input.items, input.expectedAt ?? null, input.notes ?? null, employeeId)
  return get(id)
}

// Stock is raised through the ledger inside receive_delivery(); items not listed arrive in full
const receive = async (id: number, received: { ingredientId: number; quantityReceived: string }[], employeeId: number) => {
  await deliveriesRepository.receive(id, received, employeeId)
  return get(id)
}

const cancel = async (id: number, employeeId: number) => {
  await deliveriesRepository.cancel(id, employeeId)
  return get(id)
}

export default { get, list, create, receive, cancel }
