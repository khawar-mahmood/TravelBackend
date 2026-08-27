function parseDay(value) {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function resolveFinancePeriod(query = {}) {
  const month = String(query.month || '').trim()
  const from = String(query.from || '').trim()
  const to = String(query.to || '').trim()

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 1)
    return {
      type: 'month',
      month,
      from: formatDay(start),
      to: formatDay(addDays(end, -1)),
      start,
      end,
      label: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    }
  }

  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const start = parseDay(from)
    const end = addDays(parseDay(to), 1)
    if (!start || !end || start >= end) {
      throw new Error('Invalid custom date range.')
    }
    return {
      type: 'custom',
      month: '',
      from,
      to,
      start,
      end,
      label: `${formatDisplay(from)} – ${formatDisplay(to)}`,
    }
  }

  return {
    type: 'all',
    month: '',
    from: '',
    to: '',
    start: null,
    end: null,
    label: 'All time',
  }
}

export function resolvePreviousPeriod(period) {
  if (!period || period.type === 'all' || !period.start || !period.end) {
    return null
  }

  const start = new Date(period.start)
  const end = new Date(period.end)
  const durationMs = end.getTime() - start.getTime()

  if (period.type === 'month' && period.month) {
    const [y, m] = period.month.split('-').map(Number)
    const prevStart = new Date(y, m - 2, 1)
    const prevEnd = new Date(y, m - 1, 1)
    return {
      type: 'month',
      month: `${prevStart.getFullYear()}-${String(prevStart.getMonth() + 1).padStart(2, '0')}`,
      from: formatDay(prevStart),
      to: formatDay(addDays(prevEnd, -1)),
      start: prevStart,
      end: prevEnd,
      label: prevStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    }
  }

  const prevEnd = new Date(start)
  const prevStart = new Date(start.getTime() - durationMs)
  return {
    type: 'custom',
    month: '',
    from: formatDay(prevStart),
    to: formatDay(addDays(prevEnd, -1)),
    start: prevStart,
    end: prevEnd,
    label: `${formatDisplay(formatDay(prevStart))} – ${formatDisplay(formatDay(addDays(prevEnd, -1)))}`,
  }
}

function formatDay(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDisplay(value) {
  const date = parseDay(value)
  if (!date) return value
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function inFinancePeriod(value, period) {
  if (!period?.start || !period?.end) return true
  const date = parseDay(typeof value === 'string' && value.length === 10 ? value : String(value || '').slice(0, 10))
  if (!date) return false
  return date >= period.start && date < period.end
}

export function inquiryFinanceDate(row) {
  return row.updatedAt || row.createdAt
}

export function expenseFinanceDate(row) {
  return row.expenseDate || String(row.createdAt || '').slice(0, 10)
}
