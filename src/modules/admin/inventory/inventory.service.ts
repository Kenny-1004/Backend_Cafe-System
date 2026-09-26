import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import pool, { withTransaction } from '@/db/pool'
import { toPage } from '@/utils/pagination'
import inventoryRepository from '@/modules/admin/inventory/inventory.repository'

const notFound = () => new AppError(StatusCodes.NOT_FOUND, 'Ingredient not found', 'NOT_FOUND')

const list = (filters: { search?: string; status?: string }) => inventoryRepository.list(filters)

const get = async (id: number) => {
  const ingredient = await inventoryRepository.findById(id)
  if (!ingredient) throw notFound()
  return ingredient
}

// Opening stock is itself a ledger entry, so stock_qty always matches its history
const create = async (
  fields: { name: string; unit: string; reorderLevel: string; isActive?: boolean; openingStock?: string },
  employeeId: number,
) => {
  const id = await withTransaction(async (client) => {
    const newId = await inventoryRepository.create(client, fields)
    if (fields.openingStock && Number(fields.openingStock) > 0) {
      await inventoryRepository.recordMovement(client, newId, 'adjustment', fields.openingStock, 'Opening stock', employeeId)
    }
    return newId
  })
  return get(id)
}

const update = async (id: number, fields: { name?: string; unit?: string; reorderLevel?: string; isActive?: boolean }) => {
  if (!(await inventoryRepository.update(id, fields))) throw notFound()
  return get(id)
}

const recordMovement = async (
  id: number,
  type: 'restock' | 'waste' | 'adjustment',
  quantity: string,
  note: string | null,
  employeeId: number,
) => {
  await inventoryRepository.recordMovement(pool, id, type, quantity, note, employeeId)
  return get(id)
}

const listMovements = async (id: number, limit: number, cursor: number | null) => {
  await get(id)
  return toPage(await inventoryRepository.listMovements(id, limit, cursor), limit)
}

const lowStock = () => inventoryRepository.lowStock()

export default { list, get, create, update, recordMovement, listMovements, lowStock }
