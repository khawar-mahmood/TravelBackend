import { Router } from 'express'
import Inquiry, { STATUSES } from '../models/Inquiry.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// PUBLIC: create a new inquiry (from website forms)
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, service, destination, travelDate, message, source } = req.body || {}

    if (!name || (!email && !phone)) {
      return res.status(400).json({ error: 'Please provide a name and at least an email or phone.' })
    }

    const inquiry = await Inquiry.create({
      name,
      email,
      phone,
      service,
      destination,
      travelDate,
      message,
      source: source || 'website',
      status: 'new',
    })

    res.status(201).json({ ok: true, inquiry })
  } catch (err) {
    res.status(500).json({ error: 'Could not save inquiry.', detail: err.message })
  }
})

// ---- Everything below requires admin auth ----

// LIST (optionally filter by ?status=)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status } = req.query
    const filter = status && STATUSES.includes(status) ? { status } : {}
    const inquiries = await Inquiry.find(filter).sort({ createdAt: -1 })
    res.json({ inquiries })
  } catch (err) {
    res.status(500).json({ error: 'Could not load inquiries.', detail: err.message })
  }
})

// COUNTS per status (for dashboard badges)
router.get('/stats', requireAuth, async (_req, res) => {
  try {
    const agg = await Inquiry.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
    const stats = Object.fromEntries(STATUSES.map((s) => [s, 0]))
    agg.forEach((r) => { if (r._id in stats) stats[r._id] = r.count })
    res.json({ stats })
  } catch (err) {
    res.status(500).json({ error: 'Could not load stats.', detail: err.message })
  }
})

// FULL ANALYTICS for the dashboard (KPIs, trends, breakdowns)
router.get('/analytics', requireAuth, async (_req, res) => {
  try {
    const now = new Date()
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0)

    const last14Start = new Date(startOfToday); last14Start.setDate(last14Start.getDate() - 13)
    const last7Start = new Date(startOfToday); last7Start.setDate(last7Start.getDate() - 6)
    const prev7Start = new Date(startOfToday); prev7Start.setDate(prev7Start.getDate() - 13)

    const [
      total,
      statusAgg,
      sourceAgg,
      serviceAgg,
      destAgg,
      dayAgg,
      last7Count,
      prev7Count,
      recent,
    ] = await Promise.all([
      Inquiry.countDocuments(),
      Inquiry.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Inquiry.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Inquiry.aggregate([
        { $match: { service: { $nin: ['', null] } } },
        { $group: { _id: '$service', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Inquiry.aggregate([
        { $match: { destination: { $nin: ['', null] } } },
        { $group: { _id: '$destination', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
      Inquiry.aggregate([
        { $match: { createdAt: { $gte: last14Start } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      ]),
      Inquiry.countDocuments({ createdAt: { $gte: last7Start } }),
      Inquiry.countDocuments({ createdAt: { $gte: prev7Start, $lt: last7Start } }),
      Inquiry.find().sort({ createdAt: -1 }).limit(6),
    ])

    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]))
    statusAgg.forEach((r) => { if (r._id in byStatus) byStatus[r._id] = r.count })

    // Build a continuous 14-day series (fill gaps with 0)
    const dayMap = Object.fromEntries(dayAgg.map((d) => [d._id, d.count]))
    const series = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(last14Start); d.setDate(d.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      series.push({ date: key, count: dayMap[key] || 0 })
    }

    const conversionRate = total ? Math.round((byStatus.complete / total) * 100) : 0
    const trendPct = prev7Count
      ? Math.round(((last7Count - prev7Count) / prev7Count) * 100)
      : (last7Count > 0 ? 100 : 0)

    res.json({
      total,
      byStatus,
      bySource: sourceAgg.map((r) => ({ label: r._id || 'website', count: r.count })),
      byService: serviceAgg.map((r) => ({ label: r._id, count: r.count })),
      topDestinations: destAgg.map((r) => ({ label: r._id, count: r.count })),
      series,
      last7Count,
      prev7Count,
      trendPct,
      conversionRate,
      recent,
    })
  } catch (err) {
    res.status(500).json({ error: 'Could not load analytics.', detail: err.message })
  }
})

// UPDATE status / notes
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const updates = {}
    if (req.body.status) {
      if (!STATUSES.includes(req.body.status)) {
        return res.status(400).json({ error: 'Invalid status.' })
      }
      updates.status = req.body.status
    }
    if (typeof req.body.notes === 'string') updates.notes = req.body.notes

    const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, updates, { new: true })
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' })
    res.json({ ok: true, inquiry })
  } catch (err) {
    res.status(500).json({ error: 'Could not update inquiry.', detail: err.message })
  }
})

// DELETE
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const inquiry = await Inquiry.findByIdAndDelete(req.params.id)
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Could not delete inquiry.', detail: err.message })
  }
})

export default router
