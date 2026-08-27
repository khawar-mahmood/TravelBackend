import { randomUUID } from 'node:crypto'
import { getDb, getMemoryStore, getMode } from '../db.js'
import { hashPassword } from '../lib/password.js'

const COLLECTION = 'agents'

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

function collection() {
  return getDb().collection(COLLECTION)
}

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? num : 0
}

function toClient(id, data) {
  return {
    _id: id,
    username: data.username || '',
    name: data.name || '',
    workName: data.workName || '',
    email: data.email || '',
    phone: data.phone || '',
    dateOfBirth: trim(data.dateOfBirth),
    placeOfResidence: data.placeOfResidence || '',
    dateOfJoining: trim(data.dateOfJoining),
    target: toNumber(data.target),
    active: data.active !== false,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  }
}

function sortNewest(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
}

export async function find() {
  if (getMode() === 'memory') {
    return [...getMemoryStore('agents').values()]
      .map((row) => toClient(row.id, row))
      .sort(sortNewest)
  }

  const snap = await collection().orderBy('createdAt', 'desc').get()
  return snap.docs.map((doc) => toClient(doc.id, doc.data()))
}

export async function findById(id) {
  if (getMode() === 'memory') {
    const row = getMemoryStore('agents').get(id)
    return row ? toClient(row.id, row) : null
  }

  const snap = await collection().doc(id).get()
  return snap.exists ? toClient(snap.id, snap.data()) : null
}

export async function findByUsername(username) {
  const key = trim(username).toLowerCase()
  if (!key) return null

  if (getMode() === 'memory') {
    for (const row of getMemoryStore('agents').values()) {
      if (row.username?.toLowerCase() === key) return row
    }
    return null
  }

  const snap = await collection().where('username', '==', key).limit(1).get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return { id: doc.id, ...doc.data() }
}

export async function create(input) {
  const username = trim(input.username).toLowerCase()
  const name = trim(input.name)
  const password = String(input.password || '')

  if (!username || !name || password.length < 6) {
    throw new Error('Username, name, and password (min 6 chars) are required.')
  }

  if (await findByUsername(username)) {
    throw new Error('Username already exists.')
  }

  const now = new Date()
  const payload = {
    username,
    name,
    workName: trim(input.workName),
    email: trim(input.email).toLowerCase(),
    phone: trim(input.phone),
    dateOfBirth: trim(input.dateOfBirth),
    placeOfResidence: trim(input.placeOfResidence),
    dateOfJoining: trim(input.dateOfJoining),
    target: toNumber(input.target),
    passwordHash: hashPassword(password),
    active: true,
    createdAt: now,
    updatedAt: now,
  }

  if (getMode() === 'memory') {
    const id = randomUUID()
    getMemoryStore('agents').set(id, { id, ...payload })
    return toClient(id, payload)
  }

  const ref = await collection().add(payload)
  return toClient(ref.id, payload)
}

export async function findByIdAndUpdate(id, updates) {
  const next = {}
  if (typeof updates.name === 'string') next.name = trim(updates.name)
  if (typeof updates.workName === 'string') next.workName = trim(updates.workName)
  if (typeof updates.email === 'string') next.email = trim(updates.email).toLowerCase()
  if (typeof updates.phone === 'string') next.phone = trim(updates.phone)
  if (updates.target !== undefined) next.target = toNumber(updates.target)
  if (typeof updates.active === 'boolean') next.active = updates.active
  if (updates.password) {
    if (String(updates.password).length < 6) throw new Error('Password must be at least 6 characters.')
    next.passwordHash = hashPassword(updates.password)
  }
  if (!Object.keys(next).length) return findById(id)

  next.updatedAt = new Date()

  if (getMode() === 'memory') {
    const store = getMemoryStore('agents')
    const row = store.get(id)
    if (!row) return null
    const merged = { ...row, ...next }
    store.set(id, merged)
    return toClient(id, merged)
  }

  const ref = collection().doc(id)
  const snap = await ref.get()
  if (!snap.exists) return null
  await ref.update(next)
  const updated = await ref.get()
  return toClient(updated.id, updated.data())
}

const Agent = {
  find,
  findById,
  findByUsername,
  create,
  findByIdAndUpdate,
}

export default Agent
