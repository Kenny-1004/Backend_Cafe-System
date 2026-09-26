import type { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import deliveriesService from '@/modules/admin/deliveries/deliveries.service'
import type { DeliveryStatus } from '@/modules/admin/deliveries/deliveries.repository'
import { readPage } from '@/utils/pagination'

const list = async (req: Request, res: Response) => {
  const { limit, cursor } = readPage(req)
  res.success(await deliveriesService.list((req.query.status as DeliveryStatus | undefined) ?? null, limit, cursor), 'Deliveries retrieved')
}
const get = async (req: Request, res: Response) => {
  res.success(await deliveriesService.get(Number(req.params.id)), 'Delivery retrieved')
}
const create = async (req: Request, res: Response) => {
  res.success(await deliveriesService.create(req.body, req.staff!.id), 'Delivery created', StatusCodes.CREATED)
}
const receive = async (req: Request, res: Response) => {
  res.success(await deliveriesService.receive(Number(req.params.id), req.body.received ?? [], req.staff!.id), 'Delivery received, stock updated')
}
const cancel = async (req: Request, res: Response) => {
  res.success(await deliveriesService.cancel(Number(req.params.id), req.staff!.id), 'Delivery cancelled')
}

export default { list, get, create, receive, cancel }
