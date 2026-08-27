import { randomUUID } from 'node:crypto'
import { getDb, getMemoryStore, getMode } from '../db.js'

const COLLECTION = 'expenses'
export const COST_TYPES = ['cogs', 'overhead']
export const ENTRY_TYPES = ['expense', 'refund', 'adjustment']

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
    title: data.title || '',
    category: data.category || 'general',
    amount: toNumber(data.amount),
    notes: data.notes || '',
    expenseDate: data.expenseDate || toIso(data.createdAt)?.slice(0, 10) || '',
    inquiryId: data.inquiryId || '',
    inquiryLabel: data.inquiryLabel || '',
    agentId: data.agentId || '',
    agentName: data.agentName || '',
    createdBy: data.createdBy || 'admin',
    costType: COST_TYPES.includes(data.costType) ? data.costType : 'overhead',
    entryType: ENTRY_TYPES.includes(data.entryType) ? data.entryType : 'expense',
    reference: data.reference || '',
    vatAmount: toNumber(data.vatAmount),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  }
}

function sortNewest(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
}

function applyFilters(rows, filter = {}) {
  let result = rows
  if (filter.agentId) result = result.filter((row) => row.agentId === filter.agentId)
  if (filter.inquiryId) result = result.filter((row) => row.inquiryId === filter.inquiryId)
  return result
}

export async function find(filter = {}) {
  let rows

  if (getMode() === 'memory') {
    rows = [...getMemoryStore('expenses').values()].map((row) => toClient(row.id, row))
  } else {
    const snap = await collection().orderBy('createdAt', 'desc').get()
    rows = snap.docs.map((doc) => toClient(doc.id, doc.data()))
  }

  return applyFilters(rows, filter).sort(sortNewest)
}

export async function create(input) {
  const title = trim(input.title)
  const amount = toNumber(input.amount)
  if (!title || amount <= 0) throw new Error('Description and a positive amount are required.')

  const now = new Date()
  const payload = {
    title,
    category: trim(input.category) || 'general',
    amount,
    notes: trim(input.notes),
    expenseDate: trim(input.expenseDate) || now.toISOString().slice(0, 10),
    inquiryId: trim(input.inquiryId),
    inquiryLabel: trim(input.inquiryLabel),
    agentId: trim(input.agentId),
    agentName: trim(input.agentName),
    createdBy: trim(input.createdBy) || 'admin',
    costType: COST_TYPES.includes(input.costType) ? input.costType : 'overhead',
    entryType: ENTRY_TYPES.includes(input.entryType) ? input.entryType : 'expense',
    reference: trim(input.reference),
    vatAmount: toNumber(input.vatAmount),
    createdAt: now,
    updatedAt: now,
  }

  if (getMode() === 'memory') {
    const id = randomUUID()
    getMemoryStore('expenses').set(id, { id, ...payload })
    return toClient(id, payload)
  }

  const ref = await collection().add(payload)
  return toClient(ref.id, payload)
}

export async function findById(id) {
  if (getMode() === 'memory') {
    const row = getMemoryStore('expenses').get(id)
    return row ? toClient(id, row) : null
  }

  const snap = await collection().doc(id).get()
  if (!snap.exists) return null
  return toClient(snap.id, snap.data())
}

export async function findByIdAndUpdate(id, input) {
  const existing = await findById(id)
  if (!existing) return null

  const title = input.title !== undefined ? trim(input.title) : existing.title
  const amount = input.amount !== undefined ? toNumber(input.amount) : existing.amount
  if (!title || amount <= 0) throw new Error('Description and a positive amount are required.')

  const payload = {
    title,
    amount,
    notes: input.notes !== undefined ? trim(input.notes) : existing.notes,
    category: input.category !== undefined ? trim(input.category) || 'general' : existing.category,
    expenseDate: input.expenseDate !== undefined ? trim(input.expenseDate) || existing.expenseDate : existing.expenseDate,
    costType: input.costType !== undefined
      ? (COST_TYPES.includes(input.costType) ? input.costType : existing.costType)
      : existing.costType,
    entryType: input.entryType !== undefined
      ? (ENTRY_TYPES.includes(input.entryType) ? input.entryType : existing.entryType)
      : existing.entryType,
    reference: input.reference !== undefined ? trim(input.reference) : existing.reference,
    vatAmount: input.vatAmount !== undefined ? toNumber(input.vatAmount) : existing.vatAmount,
    updatedAt: new Date(),
  }

  if (getMode() === 'memory') {
    const store = getMemoryStore('expenses')
    const row = store.get(id)
    const next = { ...row, ...payload }
    store.set(id, next)
    return toClient(id, next)
  }

  await collection().doc(id).update(payload)
  return findById(id)
}

export async function findByIdAndDelete(id) {
  if (getMode() === 'memory') {
    const store = getMemoryStore('expenses')
    const row = store.get(id)
    if (!row) return null
    store.delete(id)
    return toClient(id, row)
  }

  const ref = collection().doc(id)
  const snap = await ref.get()
  if (!snap.exists) return null
  await ref.delete()
  return toClient(snap.id, snap.data())
}

const Expense = {
  find,
  findById,
  create,
  findByIdAndUpdate,
  findByIdAndDelete,
}

export default Expense
