import { Router } from 'express'
import Inquiry, { STATUSES } from '../models/Inquiry.js'
import Agent from '../models/Agent.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { buildInquiryAnalyticsSeries } from '../lib/kpiSeries.js'

const router = Router()

function countBy(rows, key) {
  const counts = new Map()
  for (const row of rows) {
    const label = row[key] || ''
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ _id: label, count }))
    .sort((a, b) => b.count - a.count)
}

function localDayKey(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayKey(value) {
  return localDayKey(value)
}

function buildFilter(query, user) {
  const filter = {}
  const { status, source, excludeSource } = query
  if (status && STATUSES.includes(status)) filter.status = status
  if (source) filter.source = String(source)
  if (excludeSource) filter.excludeSource = String(excludeSource)
  if (user.role === 'agent') filter.assignedAgentId = user.agentId
  return filter
}

function canAccessInquiry(inquiry, user) {
  if (user.role === 'admin') return true
  return inquiry.assignedAgentId === user.agentId
}

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

router.get('/', requireAuth, async (req, res) => {
  try {
    const inquiries = await Inquiry.find(buildFilter(req.query, req.user))
    res.json({ inquiries })
  } catch (err) {
    res.status(500).json({ error: 'Could not load inquiries.', detail: err.message })
  }
})

router.get('/stats', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const inquiries = await Inquiry.find()
    const stats = Object.fromEntries(STATUSES.map((s) => [s, 0]))
    inquiries.forEach((row) => {
      if (row.status in stats) stats[row.status] += 1
    })
    res.json({ stats })
  } catch (err) {
    res.status(500).json({ error: 'Could not load stats.', detail: err.message })
  }
})

router.get('/analytics', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const last14Start = new Date(startOfToday)
    last14Start.setDate(last14Start.getDate() - 13)
    const last7Start = new Date(startOfToday)
    last7Start.setDate(last7Start.getDate() - 6)
    const prev7Start = new Date(startOfToday)
    prev7Start.setDate(prev7Start.getDate() - 13)

    const inquiries = await Inquiry.find()
    const total = inquiries.length

    const statusAgg = countBy(inquiries, 'status')
    const sourceAgg = countBy(inquiries, 'source')
    const serviceAgg = countBy(
      inquiries.filter((row) => row.service),
      'service'
    )
    const destAgg = countBy(
      inquiries.filter((row) => row.destination),
      'destination'
    ).slice(0, 6)

    const last14 = inquiries.filter((row) => {
      const created = row.createdAt ? new Date(row.createdAt) : null
      return created && created >= last14Start
    })
    const dayAgg = countBy(
      last14.map((row) => ({ day: dayKey(row.createdAt) })).filter((row) => row.day),
      'day'
    )

    const last7Count = inquiries.filter((row) => {
      const created = row.createdAt ? new Date(row.createdAt) : null
      return created && created >= last7Start
    }).length
    const prev7Count = inquiries.filter((row) => {
      const created = row.createdAt ? new Date(row.createdAt) : null
      return created && created >= prev7Start && created < last7Start
    }).length
    const recent = inquiries.slice(0, 6)

    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]))
    statusAgg.forEach((r) => {
      if (r._id in byStatus) byStatus[r._id] = r.count
    })

    const dayMap = Object.fromEntries(dayAgg.map((d) => [d._id, d.count]))
    const kpiSeries = buildInquiryAnalyticsSeries(inquiries, 14)
    const series = kpiSeries.series

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
      seriesByStatus: kpiSeries.byStatus,
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

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await Inquiry.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Inquiry not found.' })
    if (!canAccessInquiry(existing, req.user)) {
      return res.status(403).json({ error: 'You cannot update this inquiry.' })
    }

    const updates = {}
    const isAdmin = req.user.role === 'admin'

    if (req.body.status) {
      if (!STATUSES.includes(req.body.status)) {
        return res.status(400).json({ error: 'Invalid status.' })
      }
      updates.status = req.body.status
    }
    if (typeof req.body.notes === 'string') updates.notes = req.body.notes
    if (req.body.initialPayment !== undefined) updates.initialPayment = req.body.initialPayment
    if (req.body.totalPayment !== undefined) updates.totalPayment = req.body.totalPayment
    if (req.body.refundAmount !== undefined) updates.refundAmount = req.body.refundAmount
    if (req.body.paymentMethod !== undefined) updates.paymentMethod = req.body.paymentMethod
    if (req.body.paymentStatus !== undefined) updates.paymentStatus = req.body.paymentStatus
    if (typeof req.body.paymentReference === 'string') updates.paymentReference = req.body.paymentReference
    if (req.body.vatAmount !== undefined) updates.vatAmount = req.body.vatAmount
    if (typeof req.body.hasInsurance === 'boolean') updates.hasInsurance = req.body.hasInsurance
    if (typeof req.body.hasFlight === 'boolean') updates.hasFlight = req.body.hasFlight
    if (typeof req.body.signed === 'boolean') updates.signed = req.body.signed

    if (isAdmin && req.body.assignedAgentId !== undefined) {
      const agentId = String(req.body.assignedAgentId || '').trim()
      if (!agentId) {
        updates.assignedAgentId = ''
        updates.assignedAgentName = ''
      } else {
        const agent = await Agent.findById(agentId)
        if (!agent) return res.status(400).json({ error: 'Agent not found.' })
        updates.assignedAgentId = agent._id
        updates.assignedAgentName = agent.name
      }
    }

    const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, updates)
    res.json({ ok: true, inquiry })
  } catch (err) {
    res.status(500).json({ error: 'Could not update inquiry.', detail: err.message })
  }
})

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const inquiry = await Inquiry.findByIdAndDelete(req.params.id)
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Could not delete inquiry.', detail: err.message })
  }
})

export default router
