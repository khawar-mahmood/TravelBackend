import 'dotenv/config'
import { connectDB, getMode } from './db.js'
import Inquiry from './models/Inquiry.js'
import { SAMPLE_INQUIRIES } from './sampleData.js'

/**
 * Seeds sample inquiries into Firestore.
 * Requires Firebase credentials in .env (the in-memory store can't be seeded
 * from a separate process — it auto-seeds itself on server start instead).
 */
async function run() {
  const mode = await connectDB()
  if (mode !== 'firestore') {
    console.error('❌ Firebase credentials are not set. Add them to .env to seed Firestore.')
    console.error('   (In-memory mode auto-seeds itself when you run `npm run dev`.)')
    process.exit(1)
  }

  await Inquiry.deleteMany()
  await Inquiry.insertMany(SAMPLE_INQUIRIES)
  console.log(`✅ Seeded ${SAMPLE_INQUIRIES.length} sample inquiries.`)
  process.exit(0)
}

run().catch((err) => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})
