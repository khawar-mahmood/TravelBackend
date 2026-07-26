import mongoose from 'mongoose'
import dns from 'node:dns'

// Some home networks/ISPs/VPNs refuse the SRV DNS lookups that mongodb+srv://
// needs (error: querySrv ECONNREFUSED), so we point Node at a public resolver.
// On Vercel the platform resolver already works and overriding it can break
// SRV lookups, so there we only override when DNS_SERVERS is set explicitly.
const dnsDefault = process.env.VERCEL ? '' : '8.8.8.8,1.1.1.1'
const dnsServers = (process.env.DNS_SERVERS || dnsDefault)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (dnsServers.length) {
  try {
    dns.setServers(dnsServers)
  } catch {
    // ignore invalid DNS_SERVERS values; fall back to system resolver
  }
}

// Cache the connection across (serverless) invocations so we don't open a new
// MongoDB connection on every request. On Vercel, modules are reused between
// warm invocations, and `globalThis` survives, so we cache there.
let cached = globalThis.__rhMongoose
if (!cached) cached = globalThis.__rhMongoose = { conn: null, promise: null, mode: null }

/**
 * Connects to MongoDB (idempotent + cached).
 * - If MONGODB_URI is set, connects to it (Atlas/local) — required in production.
 * - If empty, falls back to an in-memory MongoDB for local dev only
 *   (requires the optional dev dependency: npm i -D mongodb-memory-server).
 * Returns: 'configured' | 'memory'
 */
export async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) return cached.mode

  if (!cached.promise) {
    cached.promise = (async () => {
      const uri = (process.env.MONGODB_URI || '').trim()

      if (uri) {
        await mongoose.connect(uri, {
          serverSelectionTimeoutMS: 8000,
          maxPoolSize: 10,
        })
        cached.mode = 'configured'
        cached.conn = mongoose.connection
        return cached.mode
      }

      // Dev-only fallback. The variable import name prevents bundlers (Vercel/ncc)
      // from trying to include this optional dev dependency in production builds.
      const pkg = 'mongodb-memory-server'
      const { MongoMemoryServer } = await import(pkg)
      const mem = await MongoMemoryServer.create()
      await mongoose.connect(mem.getUri())
      cached.mode = 'memory'
      cached.conn = mongoose.connection
      return cached.mode
    })().catch((err) => {
      cached.promise = null // allow retry on next request after a failure
      throw err
    })
  }

  await cached.promise
  return cached.mode
}
