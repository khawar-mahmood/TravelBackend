import 'dotenv/config'
import dns from 'node:dns'
import mongoose from 'mongoose'
import Inquiry from './models/Inquiry.js'
import { SAMPLE_INQUIRIES } from './sampleData.js'

// Match index.js: force a reliable DNS resolver for the SRV lookup.
try {
  dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',').map((s) => s.trim()).filter(Boolean))
} catch {
  // ignore; fall back to system resolver
}

/**
 * Seeds sample inquiries into a PERSISTENT database (local MongoDB or Atlas).
 * Requires MONGODB_URI to be set in .env (the in-memory DB can't be seeded
 * from a separate process — it auto-seeds itself on server start instead).
 */
async function run() {
  const uri = (process.env.MONGODB_URI || '').trim()
  if (!uri) {
    console.error('❌ MONGODB_URI is not set. Set it in .env to seed a persistent database.')
    console.error('   (In-memory mode auto-seeds itself when you run `npm run dev`.)')
    process.exit(1)
  }

  await mongoose.connect(uri)
  await Inquiry.deleteMany({})
  await Inquiry.insertMany(SAMPLE_INQUIRIES)
  console.log(`✅ Seeded ${SAMPLE_INQUIRIES.length} sample inquiries.`)
  await mongoose.disconnect()
  process.exit(0)
}

run().catch((err) => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})
