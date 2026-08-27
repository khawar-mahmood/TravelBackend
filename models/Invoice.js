import { randomUUID } from 'node:crypto'
import { getDb, getMemoryStore, getMode } from '../db.js'

const COLLECTION = 'invoices'

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
    agentId: data.agentId || '',
    agentName: data.agentName || '',
    inquiryId: data.inquiryId || '',
    clientName: data.clientName || '',
    amount: toNumber(data.amount),
    imageData: data.imageData || '',
    note: data.note || '',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  }
}

function sortNewest(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
}

export async function find(filter = {}) {
  let rows

  if (getMode() === 'memory') {
    rows = [...getMemoryStore('invoices').values()].map((row) => toClient(row.id, row))
  } else {
    const snap = await collection().orderBy('createdAt', 'desc').get()
    rows = snap.docs.map((doc) => toClient(doc.id, doc.data()))
  }

  if (filter.agentId) rows = rows.filter((row) => row.agentId === filter.agentId)
  if (filter.inquiryId) rows = rows.filter((row) => row.inquiryId === filter.inquiryId)
  return rows.sort(sortNewest)
}

export async function create(input) {
  const amount = toNumber(input.amount)
  const imageData = trim(input.imageData)
  if (amount <= 0) throw new Error('A positive invoice amount is required.')
  if (!imageData) throw new Error('Please attach an invoice image.')
  if (imageData.length > 2_500_000) throw new Error('Invoice image is too large. Use a smaller photo.')

  const now = new Date()
  const payload = {
    agentId: trim(input.agentId),
    agentName: trim(input.agentName),
    inquiryId: trim(input.inquiryId),
    clientName: trim(input.clientName),
    amount,
    imageData,
    note: trim(input.note),
    createdAt: now,
    updatedAt: now,
  }

  if (getMode() === 'memory') {
    const id = randomUUID()
    getMemoryStore('invoices').set(id, { id, ...payload })
    return toClient(id, payload)
  }

  const ref = await collection().add(payload)
  return toClient(ref.id, payload)
}

export async function findById(id) {
  if (getMode() === 'memory') {
    const row = getMemoryStore('invoices').get(id)
    return row ? toClient(id, row) : null
  }

  const snap = await collection().doc(id).get()
  if (!snap.exists) return null
  return toClient(snap.id, snap.data())
}

export async function findByIdAndDelete(id) {
  if (getMode() === 'memory') {
    const store = getMemoryStore('invoices')
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

const Invoice = { find, findById, create, findByIdAndDelete }
export default Invoice
