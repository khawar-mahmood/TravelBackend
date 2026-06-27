import 'dotenv/config'
import app, { origins } from './app.js'
import { connectDB } from './db.js'
import Inquiry from './models/Inquiry.js'
import { SAMPLE_INQUIRIES } from './sampleData.js'

// Local development runner (Vercel uses api/index.js instead of this file).
const PORT = process.env.PORT || 5000

async function start() {
  try {
    const mode = await connectDB()
    console.log(
      mode === 'memory'
        ? '✅ In-memory MongoDB started (dev — data resets on restart)'
        : '✅ MongoDB connected (configured URI)'
    )

    // Auto-seed sample data only for the in-memory dev database.
    if (mode === 'memory') {
      const count = await Inquiry.countDocuments()
      if (count === 0) {
        await Inquiry.insertMany(SAMPLE_INQUIRIES)
        console.log(`🌱 Seeded ${SAMPLE_INQUIRIES.length} sample inquiries (in-memory).`)
      }
    }

    app.listen(PORT, () => {
      console.log(`🚀 Robin Holidays API running on http://localhost:${PORT}`)
      console.log(`   Allowed origins: ${origins.join(', ')}`)
    })
  } catch (err) {
    console.error('Failed to start server:', err.message)
    process.exit(1)
  }
}

start()
