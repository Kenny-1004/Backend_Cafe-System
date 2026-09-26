import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import cashierRepository from '@/modules/cashier/cashier.repository'
import type { OrderStatus } from '@/modules/kiosk/kiosk.types'
import type { PaymentResult } from '@/modules/cashier/cashier.types'

const notFound = (what: string) => new AppError(StatusCodes.NOT_FOUND, `${what} not found`, 'NOT_FOUND')

const listToday = (status: OrderStatus) => cashierRepository.listToday(status)

const getByNumber = async (orderNumber: number) => {
  const order = await cashierRepository.findOrder('number', orderNumber)
  if (!order) throw notFound(`Order #${orderNumber} from today`)
  return order
}

const getById = async (id: number) => {
  const order = await cashierRepository.findOrder('id', id)
  if (!order) throw notFound('Order')
  return order
}

// Cash only: the cashier types what the customer handed over. All rules (name, amount,
// stock, state) are enforced atomically by confirm_payment(); the employee id comes from
// the verified session, never from the request body.
const pay = async (orderId: number, customerName: string, cashTendered: string, employeeId: number): Promise<PaymentResult> => {
  const paid = await cashierRepository.confirmPayment(orderId, customerName, cashTendered, employeeId)
  const order = await getById(orderId)
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerName: order.customerName ?? customerName,
    total: order.total,
    cashTendered: paid.cashTendered,
    change: paid.change,
  }
}

const cancel = async (orderId: number, employeeId: number) => {
  await cashierRepository.cancelOrder(orderId, employeeId)
  const order = await getById(orderId)
  return { orderId: order.id, orderNumber: order.orderNumber, status: order.status }
}

const summary = (employeeId: number) => cashierRepository.todaySummary(employeeId)

export default { listToday, getByNumber, getById, pay, cancel, summary }
