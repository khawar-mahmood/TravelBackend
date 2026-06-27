import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'

import { connectDB } from './db.js'
import authRoutes from './routes/auth.js'
import inquiryRoutes from './routes/inquiries.js'

const app = express()

// Allowed frontend origins (CORS). Set CLIENT_ORIGIN as a comma-separated list
// in production, e.g. "https://robinholidays.co.uk,https://www.robinholidays.co.uk"
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(cors({ origin: origins.length ? origins : true }))
app.use(express.json())

// Ensure the database is connected before handling API requests.
// This makes the same app work both as a long-running server (local) and as a
// serverless function (Vercel), where each cold start must (re)connect.
app.use(async (_req, res, next) => {
  try {
    await connectDB()
    next()
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed', detail: err.message })
  }
})

app.get('/', (_req, res) => {
  res.json({
    name: 'Robin Holidays API',
    status: 'running',
    endpoints: {
      health: '/api/health',
      login: 'POST /api/auth/login',
      inquiries: '/api/inquiries',
    },
  })
})

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/inquiries', inquiryRoutes)

export default app
export { origins }
