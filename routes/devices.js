import { Router } from 'express'
import PushDevice from '../models/PushDevice.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

const router = Router()

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const device = await PushDevice.upsert({
      token: req.body?.token,
      platform: req.body?.platform,
      username: req.user?.username || '',
    })
    res.json({ ok: true, device })
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save device token.' })
  }
})

router.delete('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    await PushDevice.removeByToken(req.body?.token)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not remove device token.' })
  }
})

export default router
