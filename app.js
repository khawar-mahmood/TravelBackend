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

const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no Origin (curl, server-to-server, some tools)
    if (!origin || origins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`))
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}

// CORS must run first. Handle OPTIONS immediately (before DB) so preflight
// never hits async middleware or gets redirected by downstream errors.
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && origins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  next()
})

app.use(express.json())

// Skip DB connect for OPTIONS (already handled above, but belt-and-braces)
app.use(async (req, res, next) => {
  if (req.method === 'OPTIONS') return next()
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
    cors: origins,
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/inquiries', inquiryRoutes)

// CORS error handler
app.use((err, req, res, next) => {
  if (err.message?.startsWith('CORS blocked')) {
    return res.status(403).json({ error: err.message, allowedOrigins: origins })
  }
  next(err)
})

export default app
export { origins }
