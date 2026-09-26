import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import { withTransaction } from '@/db/pool'
import catalogRepository, { type ProductFields } from '@/modules/admin/catalog/catalog.repository'

const notFound = (what: string) => new AppError(StatusCodes.NOT_FOUND, `${what} not found`, 'NOT_FOUND')

const listCategories = () => catalogRepository.listCategories()

const createCategory = async (name: string, sortOrder?: number) => {
  const categories = await catalogRepository.listCategories()
  const nextSort = sortOrder ?? Math.max(0, ...categories.map((category) => category.sortOrder)) + 1
  const id = await catalogRepository.createCategory(name, nextSort)
  return (await catalogRepository.listCategories()).find((category) => category.id === id)!
}

const updateCategory = async (id: number, fields: { name?: string; sortOrder?: number }) => {
  if (!(await catalogRepository.updateCategory(id, fields))) throw notFound('Category')
  return (await catalogRepository.listCategories()).find((category) => category.id === id)!
}

const listProducts = (filters: { categoryId?: number; search?: string; status?: string }) =>
  catalogRepository.listProducts(filters)

const getProduct = async (id: number) => {
  const product = await catalogRepository.findProduct(id)
  if (!product) throw notFound('Product')
  return { ...product, recipe: await catalogRepository.findRecipe(id) }
}

const createProduct = async (fields: Required<Pick<ProductFields, 'categoryId' | 'name' | 'productType' | 'price'>> & ProductFields) => {
  const id = await catalogRepository.createProduct(fields)
  return getProduct(id)
}

const updateProduct = async (id: number, fields: ProductFields) => {
  if (!(await catalogRepository.updateProduct(id, fields))) throw notFound('Product')
  return getProduct(id)
}

const replaceRecipe = async (productId: number, lines: { ingredientId: number; quantity: string }[]) => {
  if (!(await catalogRepository.findProduct(productId))) throw notFound('Product')
  await withTransaction((client) => catalogRepository.replaceRecipe(client, productId, lines))
  return getProduct(productId)
}

export default {
  listCategories,
  createCategory,
  updateCategory,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  replaceRecipe,
}
