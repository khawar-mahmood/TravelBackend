import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import { connectDB, getMode } from './db.js'
import authRoutes from './routes/auth.js'
import inquiryRoutes from './routes/inquiries.js'
import agentRoutes from './routes/agents.js'
import expenseRoutes from './routes/expenses.js'
import financeRoutes from './routes/finance.js'
import invoiceRoutes from './routes/invoices.js'
import trafficRoutes from './routes/traffic.js'
import blogRoutes from './routes/blogs.js'
import chatRoutes from './routes/chat.js'
import deviceRoutes from './routes/devices.js'

const app = express()

// Allowed frontend origins (CORS). Set CLIENT_ORIGIN as a comma-separated list
// in production, e.g. "https://robinholidays.co.uk,https://www.robinholidays.co.uk"
const origins = (process.env.CLIENT_ORIGIN ||
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no Origin (curl, server-to-server, some tools).
    // Use false (not an Error) when blocked so the response still completes
    // cleanly instead of looking like a broken preflight.
    if (!origin || origins.includes(origin)) {
      callback(null, true)
    } else {
      callback(null, false)
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

app.use(express.json({ limit: '8mb' }))

// Applied only to the data routes, so `/` and `/api/health` still answer when
// the database is unreachable — which is what tells you the database is the
// thing that's broken.
async function ensureDB(req, res, next) {
  if (req.method === 'OPTIONS') return next()
  try {
    await connectDB()
    next()
  } catch (err) {
    res.status(503).json({ error: 'Database connection failed', detail: err.message })
  }
}

app.get('/', (_req, res) => {
  res.json({
    name: 'Robin Holidays API',
    status: 'running',
    endpoints: {
      health: '/api/health',
      login: 'POST /api/auth/login',
      agentLogin: 'POST /api/auth/agent/login',
      inquiries: '/api/inquiries',
      agents: '/api/agents',
      expenses: '/api/expenses',
      finance: '/api/finance/summary',
      invoices: '/api/invoices',
      traffic: '/api/traffic/analytics',
      blogs: '/api/blogs',
      chat: 'POST /api/chat',
      devices: 'POST /api/devices',
    },
  })
})

app.get('/api/health', (_req, res) => {
  const mode = getMode()
  res.json({
    ok: true,
    db: mode === 'firestore' ? 'connected' : mode === 'memory' ? 'memory' : 'disconnected',
    time: new Date().toISOString(),
    cors: origins,
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/inquiries', ensureDB, inquiryRoutes)
app.use('/api/agents', ensureDB, agentRoutes)
app.use('/api/expenses', ensureDB, expenseRoutes)
app.use('/api/finance', ensureDB, financeRoutes)
app.use('/api/invoices', ensureDB, invoiceRoutes)
app.use('/api/traffic', ensureDB, trafficRoutes)
app.use('/api/blogs', ensureDB, blogRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/devices', ensureDB, deviceRoutes)

// CORS error handler
app.use((err, req, res, next) => {
  if (err.message?.startsWith('CORS blocked')) {
    return res.status(403).json({ error: err.message, allowedOrigins: origins })
  }
  next(err)
})

export default app
export { origins }
