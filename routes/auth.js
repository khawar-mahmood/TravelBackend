import { Router } from 'express'
import jwt from 'jsonwebtoken'
import Agent from '../models/Agent.js'
import { verifyPassword } from '../lib/password.js'

const router = Router()
const secret = () => process.env.JWT_SECRET || 'dev-secret'

router.post('/login', (req, res) => {
  const { username, password } = req.body || {}

  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin'
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid username or password.' })
  }

  const token = jwt.sign(
    { username, role: 'admin' },
    secret(),
    { expiresIn: '12h' }
  )

  res.json({ token, username, role: 'admin' })
})

router.post('/agent/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    const row = await Agent.findByUsername(username)
    if (!row || row.active === false || !verifyPassword(password, row.passwordHash)) {
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    const token = jwt.sign(
      {
        username: row.username,
        role: 'agent',
        agentId: row.id,
        name: row.name,
      },
      secret(),
      { expiresIn: '12h' }
    )

    res.json({
      token,
      username: row.username,
      role: 'agent',
      agentId: row.id,
      name: row.name,
    })
  } catch (err) {
    res.status(500).json({ error: 'Could not sign in.', detail: err.message })
  }
})

export default router
