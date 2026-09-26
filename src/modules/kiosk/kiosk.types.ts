export type ServiceType = 'dine_in' | 'take_out'

export type OrderStatus = 'unpaid' | 'pending' | 'serving' | 'completed' | 'cancelled' | 'expired'

export type MenuProduct = {
  id: number
  name: string
  description: string | null
  productType: 'prepared' | 'ready_made'
  price: string
  imageUrl: string | null
  isAvailable: boolean
}

export type MenuCategory = {
  id: number
  name: string
  products: MenuProduct[]
}

export type CreateOrderItem = {
  productId: number
  quantity: number
  notes?: string | null
}

export type CreateOrderInput = {
  serviceType: ServiceType
  items: CreateOrderItem[]
  idempotencyKey: string
}

export type OrderLine = {
  productId: number
  name: string
  quantity: number
  unitPrice: string
  lineTotal: string
  notes: string | null
}

// What the kiosk sees: identified by the unguessable publicId, never the internal id
export type KioskOrder = {
  publicId: string
  orderNumber: number
  businessDate: string
  status: OrderStatus
  serviceType: ServiceType
  total: string
  createdAt: string
  items: OrderLine[]
}
