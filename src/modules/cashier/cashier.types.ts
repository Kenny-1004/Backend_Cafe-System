import type { OrderStatus, ServiceType } from '@/modules/kiosk/kiosk.types'

export type CashierOrderSummary = {
  id: number
  orderNumber: number
  status: OrderStatus
  serviceType: ServiceType
  customerName: string | null
  total: string
  itemCount: number
  createdAt: Date
}

export type CashierOrderLine = {
  productId: number
  name: string
  quantity: number
  unitPrice: string
  lineTotal: string
  notes: string | null
}

export type CashierOrder = CashierOrderSummary & {
  businessDate: string
  paidAt: Date | null
  items: CashierOrderLine[]
}

export type PaymentResult = {
  orderId: number
  orderNumber: number
  status: OrderStatus
  customerName: string
  total: string
  cashTendered: string
  change: string
}
