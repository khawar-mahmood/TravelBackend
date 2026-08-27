import { randomUUID } from 'node:crypto'
import { getDb, getMemoryStore, getMode } from '../db.js'

const COLLECTION = 'budgets'

function trim(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? num : 0
}

function toIso(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}

function collection() {
  return getDb().collection(COLLECTION)
}

function toClient(id, data) {
  return {
    _id: id,
    month: data.month || '',
    revenueTarget: toNumber(data.revenueTarget),
    expenseTarget: toNumber(data.expenseTarget),
    notes: data.notes || '',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  }
}

export async function find() {
  if (getMode() === 'memory') {
    return [...getMemoryStore('budgets').values()]
      .map((row) => toClient(row.id, row))
      .sort((a, b) => b.month.localeCompare(a.month))
  }
  const snap = await collection().get()
  return snap.docs
    .map((doc) => toClient(doc.id, doc.data()))
    .sort((a, b) => b.month.localeCompare(a.month))
}

export async function findByMonth(month) {
  const key = trim(month)
  if (!/^\d{4}-\d{2}$/.test(key)) return null
  const rows = await find()
  return rows.find((row) => row.month === key) || null
}

export async function upsertByMonth(input) {
  const month = trim(input.month)
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Month must be YYYY-MM.')

  const existing = await findByMonth(month)
  const now = new Date()
  const payload = {
    month,
    revenueTarget: toNumber(input.revenueTarget),
    expenseTarget: toNumber(input.expenseTarget),
    notes: trim(input.notes),
    updatedAt: now,
  }

  if (getMode() === 'memory') {
    const store = getMemoryStore('budgets')
    if (existing) {
      const row = store.get(existing._id)
      const next = { ...row, ...payload }
      store.set(existing._id, next)
      return toClient(existing._id, next)
    }
    const id = randomUUID()
    store.set(id, { id, ...payload, createdAt: now })
    return toClient(id, { ...payload, createdAt: now })
  }

  if (existing) {
    await collection().doc(existing._id).update(payload)
    return findByMonth(month)
  }

  const ref = await collection().add({ ...payload, createdAt: now })
  return toClient(ref.id, { ...payload, createdAt: now })
}

const Budget = { find, findByMonth, upsertByMonth }
export default Budget
