import { Router } from 'express'
import TrafficHit from '../models/TrafficHit.js'
import Inquiry from '../models/Inquiry.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { buildTrafficAnalytics, isBot, normalizePath } from '../lib/traffic.js'

const router = Router()
const recentHits = new Map()

function pruneRecent(now) {
  if (recentHits.size < 1500) return
  for (const [key, ts] of recentHits) {
    if (now - ts > 8000) recentHits.delete(key)
  }
}

function isDuplicate(visitorId, path) {
  const now = Date.now()
  const key = `${visitorId}:${path}`
  const last = recentHits.get(key)
  recentHits.set(key, now)
  pruneRecent(now)
  return Boolean(last && now - last < 2000)
}

router.post('/hit', async (req, res) => {
  try {
    const ua = req.headers['user-agent'] || ''
    if (isBot(ua)) return res.json({ ok: true, skipped: 'bot' })

    const path = normalizePath(req.body?.path)
    if (path.startsWith('/admin') || path.startsWith('/agent')) {
      return res.json({ ok: true, skipped: 'internal' })
    }

    const visitorId = String(req.body?.visitorId || '').trim()
    if (visitorId && isDuplicate(visitorId, path)) {
      return res.json({ ok: true, duplicate: true })
    }

    const hit = await TrafficHit.create(req.body || {}, { userAgent: ua })
    res.status(201).json({ ok: true, hit: { _id: hit._id } })
  } catch (err) {
    res.status(500).json({ error: 'Could not record traffic.', detail: err.message })
  }
})

router.get('/analytics', requireAuth, requireAdmin, async (req, res) => {
  try {
    const days = [7, 14, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 14
    const now = new Date()
    const lookback = new Date(now)
    lookback.setDate(lookback.getDate() - (days * 2 + 1))
    lookback.setHours(0, 0, 0, 0)

    const [hits, inquiries] = await Promise.all([
      TrafficHit.findSince(lookback),
      Inquiry.find(),
    ])

    res.json(buildTrafficAnalytics(hits, inquiries, { days, now }))
  } catch (err) {
    res.status(500).json({ error: 'Could not load traffic analytics.', detail: err.message })
  }
})

export default router
