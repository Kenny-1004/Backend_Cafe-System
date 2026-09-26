import { StatusCodes } from 'http-status-codes'
import AppError from '@/utils/AppError'
import reportsRepository from '@/modules/admin/reports/reports.repository'

const MAX_RANGE_DAYS = 366

const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

// Defaults to the last 7 café days; from/to are café-local dates (YYYY-MM-DD)
async function resolveRange(from?: string, to?: string) {
  const today = await reportsRepository.today()
  const end = to ?? today
  const start = from ?? shiftDate(end, -6)
  if (start > end) throw new AppError(StatusCodes.BAD_REQUEST, '"from" must be on or before "to"', 'VALIDATION_FAILED')
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1
  if (days > MAX_RANGE_DAYS) {
    throw new AppError(StatusCodes.BAD_REQUEST, `The range can be at most ${MAX_RANGE_DAYS} days`, 'VALIDATION_FAILED')
  }
  return { from: start, to: end }
}

const dailySales = async (from?: string, to?: string) => {
  const range = await resolveRange(from, to)
  return { ...range, days: await reportsRepository.dailySales(range.from, range.to) }
}

const bestSellers = async (from?: string, to?: string, limit = 10) => {
  const range = await resolveRange(from, to)
  return { ...range, products: await reportsRepository.bestSellers(range.from, range.to, limit) }
}

const summary = async (from?: string, to?: string) => {
  const range = await resolveRange(from, to)
  return { ...range, ...(await reportsRepository.summary(range.from, range.to)) }
}

const dashboard = async () => {
  const today = await reportsRepository.today()
  const weekStart = shiftDate(today, -6)
  const [todaySummary, openOrders, bestSellersToday, last7Days, salesByHour] = await Promise.all([
    reportsRepository.summary(today, today),
    reportsRepository.openOrders(),
    reportsRepository.bestSellers(today, today, 5),
    reportsRepository.dailySales(weekStart, today),
    reportsRepository.salesByHourToday(),
  ])
  return { today, todaySummary, openOrders, bestSellersToday, last7Days, salesByHour }
}

export default { dailySales, bestSellers, summary, dashboard }
