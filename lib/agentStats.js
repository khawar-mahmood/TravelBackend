function money(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function clientKey(row) {
  const email = String(row.email || '').trim().toLowerCase()
  const phone = String(row.phone || '').replace(/\D/g, '')
  if (email) return `e:${email}`
  if (phone) return `p:${phone}`
  return `id:${row._id}`
}

export function buildAgentStats(agent, inquiries = [], expenses = []) {
  const agentId = agent._id
  const mine = inquiries.filter((row) => row.assignedAgentId === agentId)
  const inquiryIds = new Set(mine.map((row) => row._id))
  const completed = mine.filter((row) => row.status === 'complete')
  const completedIds = new Set(completed.map((row) => row._id))

  const relatedExpenses = []
  const seen = new Set()
  for (const row of expenses) {
    const linked = row.agentId === agentId || (row.inquiryId && inquiryIds.has(row.inquiryId))
    if (!linked || seen.has(row._id)) continue
    seen.add(row._id)
    relatedExpenses.push(row)
  }

  const totalAmount = money(mine.reduce((sum, row) => sum + Number(row.totalPayment || 0), 0))
  const totalCost = money(relatedExpenses.reduce((sum, row) => sum + Number(row.amount || 0), 0))
  const closingAmount = money(completed.reduce((sum, row) => sum + Number(row.totalPayment || 0), 0))
  const closingCost = money(
    relatedExpenses
      .filter((row) => row.inquiryId && completedIds.has(row.inquiryId))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0)
  )

  const clients = new Set(mine.map(clientKey))
  const orderCount = mine.filter((row) => Number(row.totalPayment || 0) > 0 || row.status === 'complete').length
  const invoiceCount = mine.filter((row) =>
    Number(row.initialPayment || 0) > 0
    || Number(row.vatAmount || 0) > 0
    || Boolean(row.paymentReference)
  ).length

  return {
    inquiryCount: mine.length,
    orderCount,
    clientCount: clients.size,
    invoiceCount,
    totalCost,
    totalAmount,
    profit: money(totalAmount - totalCost),
    closingAmount,
    closingCost,
    closingProfit: money(closingAmount - closingCost),
    target: money(agent.target),
  }
}
