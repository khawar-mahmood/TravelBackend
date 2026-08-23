import 'dotenv/config'
import app, { origins } from './app.js'
import { connectDB } from './db.js'
import Inquiry from './models/Inquiry.js'
import { SAMPLE_INQUIRIES } from './sampleData.js'

const PORT = process.env.PORT || 5000

// On Vercel this module is imported as the serverless entry point, so it must
// export the Express app and must not open a listening socket.
const isServerless = Boolean(process.env.VERCEL)

async function start() {
  try {
    const mode = await connectDB()
    console.log(
      mode === 'memory'
        ? '✅ In-memory store started (dev — data resets on restart)'
        : '✅ Firestore connected'
    )

    // Auto-seed sample data only for the in-memory dev store.
    if (mode === 'memory') {
      const count = await Inquiry.countDocuments()
      if (count === 0) {
        await Inquiry.insertMany(SAMPLE_INQUIRIES)
        console.log(`🌱 Seeded ${SAMPLE_INQUIRIES.length} sample inquiries (in-memory).`)
      }
    }
  } catch (err) {
    console.error(`⚠️  Database unavailable: ${err.message}`)
    console.error('   Serving anyway — check GET /api/health for the current state.')
  }

  app.listen(PORT, () => {
    console.log(`🚀 Robin Holidays API running on http://localhost:${PORT}`)
    console.log(`   Allowed origins: ${origins.join(', ')}`)
  })
}

if (!isServerless) start()

export default app
