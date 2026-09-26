import type { ApiErrorDetail } from '@/types/api'
import type { StaffPrincipal } from '@/types/auth'

declare global {
  namespace Express {
    interface Request {
      requestId: string
      // Set by the authenticate middleware on staff routes
      staff?: StaffPrincipal
      // Set by requireKiosk: the paired tablet (or a manager previewing, id 0)
      kiosk?: { id: number; name: string; preview: boolean }
    }
    interface Response {
      success: <T>(data: T, message?: string, statusCode?: number) => Response
      fail: (statusCode: number, message: string, code: string, details?: ApiErrorDetail[] | null) => Response
    }
  }
}

export {}
