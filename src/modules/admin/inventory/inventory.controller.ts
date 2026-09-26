import type { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import inventoryService from '@/modules/admin/inventory/inventory.service'
import { readPage } from '@/utils/pagination'
import { stream } from '@/realtime/sse'

const list = async (req: Request, res: Response) => {
  res.success(
    await inventoryService.list({
      search: (req.query.search as string | undefined) || undefined,
      status: req.query.status as string | undefined,
    }),
    'Ingredients retrieved',
  )
}

const get = async (req: Request, res: Response) => {
  res.success(await inventoryService.get(Number(req.params.id)), 'Ingredient retrieved')
}

const create = async (req: Request, res: Response) => {
  res.success(await inventoryService.create(req.body, req.staff!.id), 'Ingredient created', StatusCodes.CREATED)
}

const update = async (req: Request, res: Response) => {
  res.success(await inventoryService.update(Number(req.params.id), req.body), 'Ingredient updated')
}

const recordMovement = async (req: Request, res: Response) => {
  const ingredient = await inventoryService.recordMovement(
    Number(req.params.id),
    req.body.type,
    req.body.quantity,
    req.body.note ?? null,
    req.staff!.id,
  )
  res.success(ingredient, 'Stock updated', StatusCodes.CREATED)
}

const listMovements = async (req: Request, res: Response) => {
  const { limit, cursor } = readPage(req)
  res.success(await inventoryService.listMovements(Number(req.params.id), limit, cursor), 'Stock history retrieved')
}

const lowStock = async (_req: Request, res: Response) => {
  res.success(await inventoryService.lowStock(), 'Low stock retrieved')
}

const events = (req: Request, res: Response) => stream(req, res, ['admin'])

export default { list, get, create, update, recordMovement, listMovements, lowStock, events }
