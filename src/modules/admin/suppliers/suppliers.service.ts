import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import { withTransaction } from '@/db/pool'
import suppliersRepository, { type SupplierFields } from '@/modules/admin/suppliers/suppliers.repository'

const notFound = () => new AppError(StatusCodes.NOT_FOUND, 'Supplier not found', 'NOT_FOUND')

const list = () => suppliersRepository.list()

const get = async (id: number) => {
  const supplier = await suppliersRepository.findById(id)
  if (!supplier) throw notFound()
  return { ...supplier, priceList: await suppliersRepository.priceList(id) }
}

const create = async (fields: SupplierFields & { name: string }) => get(await suppliersRepository.create(fields))

const update = async (id: number, fields: SupplierFields) => {
  if (!(await suppliersRepository.update(id, fields))) throw notFound()
  return get(id)
}

const replacePriceList = async (id: number, items: { ingredientId: number; unitCost: string }[]) => {
  if (!(await suppliersRepository.findById(id))) throw notFound()
  await withTransaction((client) => suppliersRepository.replacePriceList(client, id, items))
  return get(id)
}

export default { list, get, create, update, replacePriceList }
