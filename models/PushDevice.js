import { randomUUID } from 'node:crypto'
import { getDb, getMemoryStore, getMode } from '../db.js'

const COLLECTION = 'push_devices'

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

function toClient(id, data) {
  return {
    _id: id,
    token: data.token || '',
    platform: data.platform || 'android',
    username: data.username || '',
    updatedAt: toIso(data.updatedAt),
  }
}

export async function findAll() {
  if (getMode() === 'memory') {
    return [...getMemoryStore(COLLECTION).values()].map((row) => toClient(row.id, row))
  }
  const snap = await collection().get()
  return snap.docs.map((doc) => toClient(doc.id, doc.data()))
}

export async function findByToken(token) {
  const key = trim(token)
  if (!key) return null
  if (getMode() === 'memory') {
    for (const row of getMemoryStore(COLLECTION).values()) {
      if (row.token === key) return toClient(row.id, row)
    }
    return null
  }
  const snap = await collection().where('token', '==', key).limit(1).get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return toClient(doc.id, doc.data())
}

export async function upsert({ token, platform, username }) {
  const pushToken = trim(token)
  if (!pushToken || !pushToken.startsWith('ExponentPushToken[')) {
    throw new Error('A valid Expo push token is required.')
  }

  const now = new Date()
  const existing = await findByToken(pushToken)
  const payload = {
    token: pushToken,
    platform: trim(platform) || 'android',
    username: trim(username),
    updatedAt: now,
  }

  if (getMode() === 'memory') {
    const store = getMemoryStore(COLLECTION)
    const id = existing?._id || randomUUID()
    store.set(id, { id, createdAt: existing ? undefined : now, ...payload })
    return toClient(id, payload)
  }

  if (existing) {
    await collection().doc(existing._id).update(payload)
    return toClient(existing._id, payload)
  }

  const ref = await collection().add({ ...payload, createdAt: now })
  return toClient(ref.id, payload)
}

export async function removeByToken(token) {
  const existing = await findByToken(token)
  if (!existing) return false
  if (getMode() === 'memory') {
    getMemoryStore(COLLECTION).delete(existing._id)
    return true
  }
  await collection().doc(existing._id).delete()
  return true
}

export async function removeById(id) {
  if (getMode() === 'memory') {
    return getMemoryStore(COLLECTION).delete(id)
  }
  await collection().doc(id).delete()
}

const PushDevice = { findAll, findByToken, upsert, removeByToken, removeById }
export default PushDevice
