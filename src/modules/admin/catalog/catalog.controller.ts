import type { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import catalogService from '@/modules/admin/catalog/catalog.service'

const listCategories = async (_req: Request, res: Response) => {
  res.success(await catalogService.listCategories(), 'Categories retrieved')
}

const createCategory = async (req: Request, res: Response) => {
  res.success(await catalogService.createCategory(req.body.name, req.body.sortOrder), 'Category created', StatusCodes.CREATED)
}

const updateCategory = async (req: Request, res: Response) => {
  res.success(await catalogService.updateCategory(Number(req.params.id), req.body), 'Category updated')
}

const listProducts = async (req: Request, res: Response) => {
  const products = await catalogService.listProducts({
    categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
    search: (req.query.search as string | undefined) || undefined,
    status: req.query.status as string | undefined,
  })
  res.success(products, 'Products retrieved')
}

const getProduct = async (req: Request, res: Response) => {
  res.success(await catalogService.getProduct(Number(req.params.id)), 'Product retrieved')
}

const createProduct = async (req: Request, res: Response) => {
  res.success(await catalogService.createProduct(req.body), 'Product created', StatusCodes.CREATED)
}

const updateProduct = async (req: Request, res: Response) => {
  res.success(await catalogService.updateProduct(Number(req.params.id), req.body), 'Product updated')
}

const replaceRecipe = async (req: Request, res: Response) => {
  res.success(await catalogService.replaceRecipe(Number(req.params.id), req.body.lines), 'Recipe saved')
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
