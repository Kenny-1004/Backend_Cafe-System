export type ApiErrorDetail = {
  field?: string
  message: string
}

export type ApiError = {
  code: string
  details: ApiErrorDetail[] | null
}

export type ApiResponse<T> = {
  success: boolean
  message: string
  data: T | null
  error: ApiError | null
}
