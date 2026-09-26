import { Router, type Request, type Response } from 'express'
import displayRepository from '@/modules/display/display.repository'
import { stream } from '@/realtime/sse'

// Public "now serving" screen for customers waiting at the counter. No login: it only shows
// order numbers and first names, which are called out loud anyway.
const displayRoutes = Router()

displayRoutes.get('/', async (_req: Request, res: Response) => {
  const rows = await displayRepository.findToday()
  const strip = ({ orderNumber, name, since }: (typeof rows)[number]) => ({ orderNumber, name, since })
  res.success(
    {
      preparing: rows.filter((row) => row.status === 'pending').map(strip),
      ready: rows.filter((row) => row.status === 'serving').map(strip),
    },
    'Display retrieved',
  )
})

displayRoutes.get('/events', (req: Request, res: Response) => stream(req, res, ['display']))

export default displayRoutes
