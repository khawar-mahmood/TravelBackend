import { Router } from 'express'
import Blog from '../models/Blog.js'
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth.js'

const router = Router()

router.get('/', optionalAuth, async (req, res) => {
  try {
    const header = req.headers.authorization || ''
    if (header.startsWith('Bearer ') && !req.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' })
    }
    const isAdmin = req.user?.role === 'admin'
    const blogs = await Blog.find(isAdmin ? {} : { published: true })
    res.json({ blogs })
  } catch (err) {
    res.status(500).json({ error: 'Could not load blogs.', detail: err.message })
  }
})

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const header = req.headers.authorization || ''
    if (header.startsWith('Bearer ') && !req.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' })
    }
    const blog = await Blog.findByIdOrSlug(req.params.id)
    if (!blog) return res.status(404).json({ error: 'Blog not found.' })
    if (!blog.published && req.user?.role !== 'admin') {
      return res.status(404).json({ error: 'Blog not found.' })
    }
    res.json({ blog })
  } catch (err) {
    res.status(500).json({ error: 'Could not load blog.', detail: err.message })
  }
})

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const blog = await Blog.create(req.body || {})
    res.status(201).json({ ok: true, blog })
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save blog.' })
  }
})

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const blog = await Blog.findByIdAndUpdate(req.params.id, req.body || {})
    if (!blog) return res.status(404).json({ error: 'Blog not found.' })
    res.json({ ok: true, blog })
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not update blog.' })
  }
})

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id)
    if (!blog) return res.status(404).json({ error: 'Blog not found.' })
    res.json({ ok: true, blog })
  } catch (err) {
    res.status(500).json({ error: 'Could not delete blog.', detail: err.message })
  }
})

export default router
