import { randomUUID } from 'node:crypto'
import { getDb, getMemoryStore, getMode } from '../db.js'
import {
  classifyChannel,
  classifyDevice,
  normalizePath,
  pageLabel,
} from '../lib/traffic.js'

const COLLECTION = 'trafficHits'

function trim(value, max = 200) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > max ? text.slice(0, max) : text
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

function collection() {
  return getDb().collection(COLLECTION)
}

function toClient(id, data) {
  return {
    _id: id,
    path: data.path || '/',
    page: data.page || pageLabel(data.path),
    referrer: data.referrer || '',
    utmSource: data.utmSource || '',
    utmMedium: data.utmMedium || '',
    utmCampaign: data.utmCampaign || '',
    channel: data.channel || 'direct',
    visitorId: data.visitorId || '',
    sessionId: data.sessionId || '',
    device: data.device || 'desktop',
    isNewVisitor: data.isNewVisitor === true,
    createdAt: toIso(data.createdAt),
  }
}

export async function create(input = {}, { userAgent = '' } = {}) {
  const path = normalizePath(input.path)
  const visitorId = trim(input.visitorId, 64) || randomUUID()
  const sessionId = trim(input.sessionId, 64) || randomUUID()
  const referrer = trim(input.referrer, 400)
  const utmSource = trim(input.utmSource, 80)
  const utmMedium = trim(input.utmMedium, 80)
  const utmCampaign = trim(input.utmCampaign, 120)
  const device = ['desktop', 'mobile', 'tablet'].includes(input.device)
    ? input.device
    : classifyDevice(userAgent)
  const now = input.createdAt ? toDate(input.createdAt) || new Date() : new Date()

  const payload = {
    path,
    page: pageLabel(path),
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    channel: classifyChannel({ referrer, utmSource, utmMedium }),
    visitorId,
    sessionId,
    device,
    isNewVisitor: Boolean(input.isNewVisitor),
    createdAt: now,
  }

  if (getMode() === 'memory') {
    const id = randomUUID()
    getMemoryStore('trafficHits').set(id, { id, ...payload })
    return toClient(id, payload)
  }

  const ref = await collection().add(payload)
  return toClient(ref.id, payload)
}

export async function findSince(since) {
  const start = toDate(since)
  let rows

  if (getMode() === 'memory') {
    rows = [...getMemoryStore('trafficHits').values()].map((row) => toClient(row.id, row))
  } else if (start) {
    const snap = await collection().where('createdAt', '>=', start).get()
    rows = snap.docs.map((doc) => toClient(doc.id, doc.data()))
  } else {
    const snap = await collection().get()
    rows = snap.docs.map((doc) => toClient(doc.id, doc.data()))
  }

  if (!start) return rows
  return rows.filter((row) => {
    const created = toDate(row.createdAt)
    return created && created >= start
  })
}

export async function insertMany(items) {
  const created = []
  for (const item of items) {
    created.push(await create(item))
  }
  return created
}

const TrafficHit = {
  create,
  findSince,
  insertMany,
}

export default TrafficHit
