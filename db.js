import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Cache across warm Vercel invocations so we don't re-init Firebase on every request.
let cached = globalThis.__rhFirebase
if (!cached) {
  cached = globalThis.__rhFirebase = {
    db: null,
    memory: null,
    mode: null,
    promise: null,
  }
}

function parseServiceAccount() {
  const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim()
  if (rawJson) {
    const parsed = JSON.parse(rawJson)
    if (typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')
    }
    return parsed
  }

  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim()
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim()
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey }
  }

  return null
}

/**
 * Connects to Firestore (idempotent + cached).
 * - If Firebase credentials are set, uses Firestore — required in production.
 * - If empty, falls back to an in-memory store for local dev only.
 * Returns: 'firestore' | 'memory'
 */
export async function connectDB() {
  if (cached.mode) return cached.mode

  if (!cached.promise) {
    cached.promise = (async () => {
      const credentials = parseServiceAccount()

      if (credentials) {
        if (!getApps().length) {
          initializeApp({ credential: cert(credentials) })
        }
        cached.db = getFirestore()
        cached.mode = 'firestore'
        return cached.mode
      }

      if (process.env.VERCEL) {
        throw new Error(
          'Firebase credentials are required in production. Set FIREBASE_SERVICE_ACCOUNT, or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.'
        )
      }

      cached.memory = new Map()
      cached.mode = 'memory'
      return cached.mode
    })().catch((err) => {
      cached.promise = null
      throw err
    })
  }

  await cached.promise
  return cached.mode
}

export function getDb() {
  if (!cached.db) throw new Error('Firestore is not connected.')
  return cached.db
}

export function getMemory() {
  if (!cached.memory) throw new Error('In-memory store is not available.')
  return cached.memory
}

export function getMode() {
  return cached.mode
}
