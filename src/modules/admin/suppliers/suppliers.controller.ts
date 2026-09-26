import type { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import suppliersService from '@/modules/admin/suppliers/suppliers.service'

const list = async (_req: Request, res: Response) => {
  res.success(await suppliersService.list(), 'Suppliers retrieved')
}
const get = async (req: Request, res: Response) => {
  res.success(await suppliersService.get(Number(req.params.id)), 'Supplier retrieved')
}
const create = async (req: Request, res: Response) => {
  res.success(await suppliersService.create(req.body), 'Supplier created', StatusCodes.CREATED)
}
const update = async (req: Request, res: Response) => {
  res.success(await suppliersService.update(Number(req.params.id), req.body), 'Supplier updated')
}
const replacePriceList = async (req: Request, res: Response) => {
  res.success(await suppliersService.replacePriceList(Number(req.params.id), req.body.items), 'Price list saved')
}

export default { list, get, create, update, replacePriceList }
