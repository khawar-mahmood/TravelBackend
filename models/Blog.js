import { randomUUID } from 'node:crypto'
import { getDb, getMemoryStore, getMode } from '../db.js'
import { slugify } from '../lib/slug.js'

const COLLECTION = 'blogs'
const COVER_MAX = 900_000
const BODY_MAX = 40_000

function trim(value, max = 0) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (max && text.length > max) return text.slice(0, max)
  return text
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

function toClient(id, data, { list = false } = {}) {
  const row = {
    _id: id,
    title: data.title || '',
    slug: data.slug || '',
    excerpt: data.excerpt || '',
    coverImage: data.coverImage || '',
    published: data.published === true,
    author: data.author || 'Robin Holidays',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    publishedAt: toIso(data.publishedAt),
  }
  if (!list) row.body = data.body || ''
  return row
}

function sortNewest(a, b) {
  const aDate = new Date(a.publishedAt || a.createdAt || 0)
  const bDate = new Date(b.publishedAt || b.createdAt || 0)
  return bDate - aDate
}

async function uniqueSlug(base, excludeId = '') {
  let slug = slugify(base)
  let n = 2
  while (true) {
    const existing = await findBySlug(slug)
    if (!existing || existing._id === excludeId) return slug
    slug = `${slugify(base).slice(0, 70)}-${n}`
    n += 1
  }
}

function sanitize(input = {}, existing = {}) {
  const title = trim(input.title, 160)
  const excerpt = trim(input.excerpt, 400)
  const body = trim(input.body, BODY_MAX)
  const coverImage = typeof input.coverImage === 'string' ? input.coverImage : (existing.coverImage || '')
  const published = input.published === true || input.published === 'true'
  const author = trim(input.author, 80) || existing.author || 'Robin Holidays'

  if (coverImage && coverImage.length > COVER_MAX) {
    throw new Error('Cover image is too large. Use a smaller photo.')
  }

  return { title, excerpt, body, coverImage, published, author }
}

export async function find({ published } = {}) {
  let rows
  if (getMode() === 'memory') {
    rows = [...getMemoryStore('blogs').values()].map((row) => toClient(row.id, row, { list: true }))
  } else {
    const snap = await collection().get()
    rows = snap.docs.map((doc) => toClient(doc.id, doc.data(), { list: true }))
  }
  if (published === true) rows = rows.filter((row) => row.published)
  return rows.sort(sortNewest)
}

export async function findById(id) {
  if (getMode() === 'memory') {
    const row = getMemoryStore('blogs').get(id)
    return row ? toClient(id, row) : null
  }
  const snap = await collection().doc(id).get()
  return snap.exists ? toClient(snap.id, snap.data()) : null
}

export async function findBySlug(slug) {
  const key = trim(slug).toLowerCase()
  if (!key) return null
  if (getMode() === 'memory') {
    for (const row of getMemoryStore('blogs').values()) {
      if (row.slug === key) return toClient(row.id, row)
    }
    return null
  }
  const snap = await collection().where('slug', '==', key).limit(1).get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return toClient(doc.id, doc.data())
}

export async function findByIdOrSlug(idOrSlug) {
  const row = await findById(idOrSlug)
  if (row) return row
  return findBySlug(idOrSlug)
}

export async function create(input = {}) {
  const data = sanitize(input)
  if (!data.title) throw new Error('A title is required.')
  if (!data.body) throw new Error('Blog content is required.')
  if (data.published && !data.coverImage) throw new Error('Add a cover image before publishing.')

  const now = new Date()
  const slug = await uniqueSlug(input.slug || data.title)
  const payload = {
    ...data,
    slug,
    createdAt: now,
    updatedAt: now,
    publishedAt: data.published ? now : null,
  }

  if (getMode() === 'memory') {
    const id = randomUUID()
    getMemoryStore('blogs').set(id, { id, ...payload })
    return toClient(id, payload)
  }

  const ref = await collection().add(payload)
  return toClient(ref.id, payload)
}

export async function findByIdAndUpdate(id, input = {}) {
  const existing = await findById(id)
  if (!existing) return null

  const data = sanitize({ ...existing, ...input }, existing)
  if (!data.title) throw new Error('A title is required.')
  if (!data.body) throw new Error('Blog content is required.')
  if (data.published && !data.coverImage) throw new Error('Add a cover image before publishing.')

  const slugSource = input.slug !== undefined ? input.slug : existing.slug
  const slug = await uniqueSlug(slugSource || data.title, id)
  const publishedAt = data.published
    ? (existing.publishedAt ? new Date(existing.publishedAt) : new Date())
    : null

  const payload = {
    ...data,
    slug,
    publishedAt,
    updatedAt: new Date(),
  }

  if (getMode() === 'memory') {
    const store = getMemoryStore('blogs')
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
    const store = getMemoryStore('blogs')
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

const Blog = {
  find,
  findById,
  findBySlug,
  findByIdOrSlug,
  create,
  findByIdAndUpdate,
  findByIdAndDelete,
}

export default Blog
