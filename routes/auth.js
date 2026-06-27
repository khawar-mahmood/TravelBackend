import { Router } from 'express'
import jwt from 'jsonwebtoken'

const router = Router()

router.post('/login', (req, res) => {
  const { username, password } = req.body || {}

  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin'
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid username or password.' })
  }

  const token = jwt.sign(
    { username, role: 'admin' },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '12h' }
  )

  res.json({ token, username })
})

export default router
