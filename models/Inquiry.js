import { randomUUID } from 'node:crypto'
import { getDb, getMemory, getMode } from '../db.js'

export const STATUSES = ['new', 'in_process', 'complete', 'failed']

const COLLECTION = 'inquiries'

function trim(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function toIso(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}

function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function sanitize(input = {}) {
  const status = STATUSES.includes(input.status) ? input.status : 'new'
  return {
    name: trim(input.name),
    email: trim(input.email).toLowerCase(),
    phone: trim(input.phone),
    service: trim(input.service),
    destination: trim(input.destination),
    travelDate: trim(input.travelDate),
    message: trim(input.message),
    source: trim(input.source) || 'website',
    status,
    notes: trim(input.notes),
  }
}

function toClient(id, data) {
  return {
    _id: id,
    name: data.name || '',
    email: data.email || '',
    phone: data.phone || '',
    service: data.service || '',
    destination: data.destination || '',
    travelDate: data.travelDate || '',
    message: data.message || '',
    source: data.source || 'website',
    status: data.status || 'new',
    notes: data.notes || '',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  }
}

function collection() {
  return getDb().collection(COLLECTION)
}

function sortNewest(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
}

export async function create(input) {
  const now = new Date()
  const payload = { ...sanitize(input), createdAt: now, updatedAt: now }

  if (getMode() === 'memory') {
    const id = randomUUID()
    getMemory().set(id, { id, ...payload })
    return toClient(id, payload)
  }

  const ref = await collection().add(payload)
  return toClient(ref.id, payload)
}

export async function find(filter = {}) {
  if (getMode() === 'memory') {
    const rows = [...getMemory().values()].map((row) => toClient(row.id, row))
    const filtered = filter.status ? rows.filter((row) => row.status === filter.status) : rows
    return filtered.sort(sortNewest)
  }

  const snap = filter.status
    ? await collection().where('status', '==', filter.status).get()
    : await collection().orderBy('createdAt', 'desc').get()

  const rows = snap.docs.map((doc) => toClient(doc.id, doc.data()))
  return filter.status ? rows.sort(sortNewest) : rows
}

export async function findById(id) {
  if (getMode() === 'memory') {
    const row = getMemory().get(id)
    return row ? toClient(row.id, row) : null
  }

  const snap = await collection().doc(id).get()
  return snap.exists ? toClient(snap.id, snap.data()) : null
}

export async function findByIdAndUpdate(id, updates) {
  const next = {}
  if (updates.status) next.status = updates.status
  if (typeof updates.notes === 'string') next.notes = trim(updates.notes)
  if (!Object.keys(next).length) return findById(id)

  next.updatedAt = new Date()

  if (getMode() === 'memory') {
    const row = getMemory().get(id)
    if (!row) return null
    const merged = { ...row, ...next }
    getMemory().set(id, merged)
    return toClient(id, merged)
  }

  const ref = collection().doc(id)
  const snap = await ref.get()
  if (!snap.exists) return null
  await ref.update(next)
  const updated = await ref.get()
  return toClient(updated.id, updated.data())
}

export async function findByIdAndDelete(id) {
  if (getMode() === 'memory') {
    const row = getMemory().get(id)
    if (!row) return null
    getMemory().delete(id)
    return toClient(id, row)
  }

  const ref = collection().doc(id)
  const snap = await ref.get()
  if (!snap.exists) return null
  await ref.delete()
  return toClient(snap.id, snap.data())
}

export async function countDocuments(filter = {}) {
  const rows = await find(filter.status ? { status: filter.status } : {})
  if (!filter.createdAt) return rows.length

  return rows.filter((row) => {
    const created = toDate(row.createdAt)
    if (!created) return false
    if (filter.createdAt.$gte && created < filter.createdAt.$gte) return false
    if (filter.createdAt.$lt && created >= filter.createdAt.$lt) return false
    return true
  }).length
}

export async function insertMany(items) {
  const created = []
  for (const item of items) {
    created.push(await create(item))
  }
  return created
}

export async function deleteMany() {
  if (getMode() === 'memory') {
    getMemory().clear()
    return
  }

  const db = getDb()
  const snap = await collection().get()
  const docs = snap.docs
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch()
    docs.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
  }
}

const Inquiry = {
  create,
  find,
  findById,
  findByIdAndUpdate,
  findByIdAndDelete,
  countDocuments,
  insertMany,
  deleteMany,
}

export default Inquiry
