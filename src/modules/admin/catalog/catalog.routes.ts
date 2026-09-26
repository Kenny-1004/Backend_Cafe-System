import { Router } from 'express'
import validate from '@/middlewares/validate'
import catalogController from '@/modules/admin/catalog/catalog.controller'
import {
  createCategoryRules,
  createProductRules,
  listProductsRules,
  productIdRules,
  recipeRules,
  updateCategoryRules,
  updateProductRules,
} from '@/modules/admin/catalog/catalog.validator'

const catalogRoutes = Router()

catalogRoutes.get('/categories', catalogController.listCategories)
catalogRoutes.post('/categories', createCategoryRules, validate, catalogController.createCategory)
catalogRoutes.patch('/categories/:id', updateCategoryRules, validate, catalogController.updateCategory)

catalogRoutes.get('/products', listProductsRules, validate, catalogController.listProducts)
catalogRoutes.post('/products', createProductRules, validate, catalogController.createProduct)
catalogRoutes.get('/products/:id', productIdRules, validate, catalogController.getProduct)
catalogRoutes.patch('/products/:id', updateProductRules, validate, catalogController.updateProduct)
catalogRoutes.put('/products/:id/recipe', recipeRules, validate, catalogController.replaceRecipe)

export default catalogRoutes
