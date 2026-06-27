import 'dotenv/config'
import dns from 'node:dns'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'

import { connectDB } from './db.js'

// Some networks/ISPs/VPNs refuse the SRV DNS lookups that mongodb+srv:// needs
// (error: querySrv ECONNREFUSED). Force a reliable public resolver so the
// Atlas connection works regardless of the machine's default DNS settings.
const DNS_SERVERS = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
try {
  dns.setServers(DNS_SERVERS)
} catch {
  // ignore invalid DNS_SERVERS values; fall back to system resolver
}
import Inquiry from './models/Inquiry.js'
import { SAMPLE_INQUIRIES } from './sampleData.js'
import authRoutes from './routes/auth.js'
import inquiryRoutes from './routes/inquiries.js'

const app = express()
const PORT = process.env.PORT || 5000

const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(cors({ origin: origins.length ? origins : true }))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/inquiries', inquiryRoutes)

async function start() {
  try {
    const mode = await connectDB()

    // Seed sample data automatically when using the in-memory dev DB
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
