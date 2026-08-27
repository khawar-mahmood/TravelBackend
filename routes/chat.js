import { Router } from 'express'
import { generateVisaReply, hasChatAi } from '../lib/visaChatAi.js'

const router = Router()
const hits = new Map()

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim()
  return req.ip || req.socket?.remoteAddress || 'unknown'
}

function tooMany(ip) {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000)
  if (recent.length >= 24) {
    hits.set(ip, recent)
    return true
  }
  recent.push(now)
  hits.set(ip, recent)
  return false
}

router.post('/', async (req, res) => {
  try {
    if (!hasChatAi()) {
      return res.json({ local: true })
    }
    if (tooMany(clientIp(req))) {
      return res.status(429).json({ error: 'Give me a second — too many messages at once.' })
    }
    const reply = await generateVisaReply(req.body?.messages)
    if (!reply) return res.json({ local: true })
    res.json({ reply })
  } catch (err) {
    res.json({ local: true, detail: err.message })
  }
})

export default router
