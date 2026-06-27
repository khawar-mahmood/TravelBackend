import mongoose from 'mongoose'

/**
 * Connects to MongoDB.
 * - If MONGODB_URI is set, it connects to that (local or Atlas).
 * - If not set (or connection fails) it falls back to an in-memory MongoDB,
 *   which is great for local development/demo. That fallback requires the
 *   optional dev dependency:  npm i -D mongodb-memory-server
 *
 * Returns: 'configured' | 'memory'
 */
export async function connectDB() {
  const uri = (process.env.MONGODB_URI || '').trim()

  if (uri) {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
    console.log('✅ MongoDB connected (configured URI)')
    return 'configured'
  }

  console.warn('ℹ️  MONGODB_URI is empty — starting in-memory MongoDB for development.')
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    const mem = await MongoMemoryServer.create()
    await mongoose.connect(mem.getUri())
    console.log('✅ In-memory MongoDB started (data resets on restart)')
    return 'memory'
  } catch (err) {
    console.error('❌ Could not start in-memory MongoDB:', err.message)
    console.error('   Either set MONGODB_URI in .env (Atlas/local), or install the dev dependency:')
    console.error('   npm i -D mongodb-memory-server')
    throw err
  }
}
