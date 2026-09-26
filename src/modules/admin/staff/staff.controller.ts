import type { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import staffService from '@/modules/admin/staff/staff.service'

const list = async (_req: Request, res: Response) => {
  res.success(await staffService.list(), 'Staff retrieved')
}
const get = async (req: Request, res: Response) => {
  res.success(await staffService.get(Number(req.params.id)), 'Employee retrieved')
}
const create = async (req: Request, res: Response) => {
  res.success(await staffService.create(req.body), 'Employee created', StatusCodes.CREATED)
}
const update = async (req: Request, res: Response) => {
  res.success(await staffService.update(Number(req.params.id), req.body, req.staff!.id), 'Employee updated')
}

export default { list, get, create, update }
