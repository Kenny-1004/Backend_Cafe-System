import type { Request, Response } from 'express'
import ordersService from '@/modules/admin/orders/orders.service'
import type { OrderStatus } from '@/modules/kiosk/kiosk.types'
import { readPage } from '@/utils/pagination'

const list = async (req: Request, res: Response) => {
  const { limit, cursor } = readPage(req)
  const page = await ordersService.list(
    {
      date: (req.query.date as string | undefined) ?? null,
      status: (req.query.status as OrderStatus | undefined) ?? null,
      search: (req.query.search as string | undefined)?.trim() || null,
    },
    limit,
    cursor,
  )
  res.success(page, 'Orders retrieved')
}

const get = async (req: Request, res: Response) => {
  res.success(await ordersService.get(Number(req.params.id)), 'Order retrieved')
}

export default { list, get }
