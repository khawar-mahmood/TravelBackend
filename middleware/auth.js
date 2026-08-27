import jwt from 'jsonwebtoken'

const secret = () => process.env.JWT_SECRET || 'dev-secret'

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' })
  }

  try {
    req.user = jwt.verify(token, secret())
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' })
  }
  next()
}

export function requireAgent(req, res, next) {
  if (req.user?.role !== 'agent') {
    return res.status(403).json({ error: 'Agent access required.' })
  }
  next()
}
