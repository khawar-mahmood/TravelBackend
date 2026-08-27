export function localDayKey(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDay(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function buildLastNDays(count, endDate = new Date()) {
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - (count - 1))
  return buildDayKeysBetween(start, new Date(end.getTime() + 86400000))
}

export function buildDayKeysBetween(start, endExclusive) {
  const keys = []
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(endExclusive)
  end.setHours(0, 0, 0, 0)
  while (cursor < end) {
    keys.push(localDayKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

export function aggregateDaily(items, dayKeys, getDay, getValue = () => 1) {
  const map = new Map(dayKeys.map((key) => [key, 0]))
  for (const item of items || []) {
    const day = getDay(item)
    if (!day || !map.has(day)) continue
    map.set(day, map.get(day) + getValue(item))
  }
  return dayKeys.map((key) => map.get(key) || 0)
}

export function buildInquiryAnalyticsSeries(inquiries, dayCount = 14) {
  const dayKeys = buildLastNDays(dayCount)
  const created = aggregateDaily(inquiries, dayKeys, (row) => localDayKey(row.createdAt))
  const series = dayKeys.map((date, index) => ({ date, count: created[index] }))

  const byStatus = {}
  for (const status of ['new', 'in_process', 'complete', 'failed']) {
    const filtered = inquiries.filter((row) => row.status === status)
    const getDay = status === 'new'
      ? (row) => localDayKey(row.createdAt)
      : (row) => localDayKey(row.updatedAt || row.createdAt)
    byStatus[status] = aggregateDaily(filtered, dayKeys, getDay)
  }

  return { dayKeys, series, byStatus, created }
}

export function buildFinanceSeries({ inquiries, expenses, period }, dayCount = 14) {
  const dayKeys = period?.start && period?.end
    ? buildDayKeysBetween(period.start, period.end)
    : buildLastNDays(dayCount)

  const revenueRows = inquiries.filter((row) => row.totalPayment > 0 || row.initialPayment > 0)
  const revenue = aggregateDaily(
    revenueRows,
    dayKeys,
    (row) => localDayKey(row.updatedAt || row.createdAt),
    (row) => row.totalPayment,
  )
  const initial = aggregateDaily(
    revenueRows,
    dayKeys,
    (row) => localDayKey(row.updatedAt || row.createdAt),
    (row) => row.initialPayment,
  )
  const expenseTotals = aggregateDaily(
    expenses,
    dayKeys,
    (row) => localDayKey(row.expenseDate || row.createdAt),
    (row) => row.amount,
  )
  const profit = revenue.map((value, index) => value - expenseTotals[index])

  return { dayKeys, revenue, initial, expenses: expenseTotals, profit }
}

export function buildAgentSeries(inquiries, period = null, dayCount = 14) {
  const dayKeys = period?.start && period?.end
    ? buildDayKeysBetween(period.start, period.end)
    : buildLastNDays(dayCount)
  const assigned = inquiries.filter((row) => row.assignedAgentId)

  return {
    dayKeys,
    dealt: aggregateDaily(assigned, dayKeys, (row) => localDayKey(row.createdAt)),
    success: aggregateDaily(
      assigned.filter((row) => row.status === 'complete'),
      dayKeys,
      (row) => localDayKey(row.updatedAt || row.createdAt),
    ),
    failure: aggregateDaily(
      assigned.filter((row) => row.status === 'failed'),
      dayKeys,
      (row) => localDayKey(row.updatedAt || row.createdAt),
    ),
    revenue: aggregateDaily(
      assigned,
      dayKeys,
      (row) => localDayKey(row.updatedAt || row.createdAt),
      (row) => row.totalPayment,
    ),
  }
}

export function buildAgentPortalSeries(inquiries, expenses, dayCount = 14) {
  const dayKeys = buildLastNDays(dayCount)
  const expenseTotals = aggregateDaily(
    expenses,
    dayKeys,
    (row) => localDayKey(row.expenseDate || row.createdAt),
    (row) => row.amount,
  )
  const revenue = aggregateDaily(
    inquiries,
    dayKeys,
    (row) => localDayKey(row.updatedAt || row.createdAt),
    (row) => row.totalPayment,
  )
  const assigned = aggregateDaily(inquiries, dayKeys, (row) => localDayKey(row.createdAt))
  const completed = aggregateDaily(
    inquiries.filter((row) => row.status === 'complete'),
    dayKeys,
    (row) => localDayKey(row.updatedAt || row.createdAt),
  )
  const profit = revenue.map((value, index) => value - expenseTotals[index])

  return { dayKeys, assigned, completed, revenue, expenses: expenseTotals, profit }
}

export function buildPerAgentSeries(inquiries, period = null, dayCount = 14) {
  const dayKeys = period?.start && period?.end
    ? buildDayKeysBetween(period.start, period.end)
    : buildLastNDays(dayCount)

  const grouped = new Map()
  for (const row of inquiries) {
    if (!row.assignedAgentId) continue
    if (!grouped.has(row.assignedAgentId)) grouped.set(row.assignedAgentId, [])
    grouped.get(row.assignedAgentId).push(row)
  }

  const byAgent = {}
  for (const [agentId, agentInquiries] of grouped) {
    byAgent[agentId] = {
      dealt: aggregateDaily(agentInquiries, dayKeys, (row) => localDayKey(row.createdAt)),
      success: aggregateDaily(
        agentInquiries.filter((row) => row.status === 'complete'),
        dayKeys,
        (row) => localDayKey(row.updatedAt || row.createdAt),
      ),
      failure: aggregateDaily(
        agentInquiries.filter((row) => row.status === 'failed'),
        dayKeys,
        (row) => localDayKey(row.updatedAt || row.createdAt),
      ),
      revenue: aggregateDaily(
        agentInquiries,
        dayKeys,
        (row) => localDayKey(row.updatedAt || row.createdAt),
        (row) => row.totalPayment,
      ),
    }
  }

  return { dayKeys, byAgent }
}
