import boardRepository from '@/modules/board/board.repository'

const snapshot = async () => {
  const cards = await boardRepository.findCards()
  return {
    pending: cards.filter((card) => card.status === 'pending'),
    serving: cards.filter((card) => card.status === 'serving'),
  }
}

const serve = (orderId: number, employeeId: number) => boardRepository.markServing(orderId, employeeId)

// Orders that are no longer 'serving' are skipped, so a double tap clears 0
const complete = async (orderIds: number[], employeeId: number) => ({
  cleared: await boardRepository.completeOrders([...new Set(orderIds)], employeeId),
})

export default { snapshot, serve, complete }
